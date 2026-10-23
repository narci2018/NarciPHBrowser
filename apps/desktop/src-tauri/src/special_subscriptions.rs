use std::path::PathBuf;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use narrc_core::subscription::{BUILTIN_MEGAV_ID, BUILTIN_PSIPHON_ID, BUILTIN_VPNGATE_ID};

const CORE_DIR: &str = "mihomo";

/// Gets the provider file path for a built-in subscription.
pub fn special_provider_path(id: &str) -> Option<PathBuf> {
    let home = dirs_next::home_dir()?;
    Some(
        home.join(CORE_DIR)
            .join("network")
            .join("providers")
            .join(format!("{id}.yaml")),
    )
}

/// Seed configurations loaded from bundled files.
fn default_psiphon_yaml() -> &'static str {
    include_str!("psiphon_seed.yaml")
}

fn default_vpngate_yaml() -> &'static str {
    include_str!("vpngate_seed.yaml")
}

fn default_megav_yaml() -> &'static str {
    include_str!("megav_seed.yaml")
}

/// Helper to detect local proxy (e.g. from Windows registry or environment)
pub fn detect_system_proxy() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;
        if let Ok(hkcu) = RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        {
            if let Ok(enable) = hkcu.get_value::<u32, _>("ProxyEnable") {
                if enable == 1 {
                    if let Ok(server) = hkcu.get_value::<String, _>("ProxyServer") {
                        let trimmed = server.trim();
                        if !trimmed.is_empty() {
                            let proxy_url = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                                trimmed.to_string()
                            } else {
                                format!("http://{trimmed}")
                            };
                            return Some(proxy_url);
                        }
                    }
                }
            }
        }
    }

    if let Ok(p) = std::env::var("HTTPS_PROXY") {
        return Some(p);
    }
    if let Ok(p) = std::env::var("HTTP_PROXY") {
        return Some(p);
    }
    if let Ok(p) = std::env::var("all_proxy") {
        return Some(p);
    }

    None
}

/// Creates a reqwest blocking client, optionally configured with detected proxy.
pub fn proxy_aware_client(timeout_secs: u64, use_proxy: bool) -> reqwest::blocking::Client {
    let mut builder = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(timeout_secs));

    if use_proxy {
        if let Some(proxy_url) = detect_system_proxy() {
            if let Ok(proxy) = reqwest::Proxy::all(&proxy_url) {
                builder = builder.proxy(proxy);
            }
        }
    }

    builder.build().unwrap_or_else(|_| reqwest::blocking::Client::new())
}

/// Ensures the initial provider YAML file exists for the given special subscription id.
pub fn ensure_special_provider_file(id: &str) -> Result<(), String> {
    let Some(path) = special_provider_path(id) else {
        return Ok(());
    };
    if path.is_file() {
        if id == BUILTIN_VPNGATE_ID {
            let existing = std::fs::read_to_string(&path).unwrap_or_default();
            let count = existing.lines().filter(|l| l.trim_start().starts_with("- name:")).count();
            // If the provider file carries obsolete socks5 1080 dummy nodes or fewer than 100 nodes, refresh it with OpenVPN nodes
            if existing.contains("type: socks5") || existing.contains("128.211.249.131") || count < 100 {
                let _ = std::fs::remove_file(&path);
            } else {
                return Ok(());
            }
        } else {
            return Ok(());
        }
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("could not create provider dir: {e}"))?;
    }
    let content = match id {
        BUILTIN_PSIPHON_ID => default_psiphon_yaml().to_string(),
        BUILTIN_VPNGATE_ID => {
            let base = default_vpngate_yaml();
            let transit_config = load_vpngate_transit_config();
            let target = vpngate_transit_target_name(&transit_config);
            apply_transit_to_vpngate_content(base, target.as_deref())
        }
        BUILTIN_MEGAV_ID => default_megav_yaml().to_string(),
        _ => return Ok(()),
    };
    std::fs::write(&path, content).map_err(|e| format!("could not write initial provider {id}: {e}"))?;
    Ok(())
}

/// Helper to parse ISO country code to Country name with Emoji flag.
fn country_flag_and_name(code: &str) -> (&'static str, &'static str) {
    match code.to_uppercase().as_str() {
        "US" => ("🇺🇸", "美国"),
        "JP" => ("🇯🇵", "日本"),
        "KR" => ("🇰🇷", "韩国"),
        "DE" => ("🇩🇪", "德国"),
        "GB" | "UK" => ("🇬🇧", "英国"),
        "SG" => ("🇸🇬", "新加坡"),
        "HK" => ("🇭🇰", "中国香港"),
        "TW" => ("🇨🇳", "中国台湾"),
        "NL" => ("🇳🇱", "荷兰"),
        "FI" => ("🇫🇮", "芬兰"),
        "FR" => ("🇫🇷", "法国"),
        "CA" => ("🇨🇦", "加拿大"),
        "AU" => ("🇦🇺", "澳大利亚"),
        "RU" => ("🇷🇺", "俄罗斯"),
        "VN" => ("🇻🇳", "越南"),
        "RO" => ("🇷🇴", "罗马尼亚"),
        "HU" => ("🇭🇺", "匈牙利"),
        "CL" => ("🇨🇱", "智利"),
        "AR" => ("🇦🇷", "阿根廷"),
        "TH" => ("🇹🇭", "泰国"),
        "IN" => ("🇮🇳", "印度"),
        "BR" => ("🇧🇷", "巴西"),
        "ID" => ("🇮🇩", "印度尼西亚"),
        "MY" => ("🇲🇾", "马来西亚"),
        "PH" => ("🇵🇭", "菲律宾"),
        "UA" => ("🇺🇦", "乌克兰"),
        "PL" => ("🇵🇱", "波兰"),
        "ES" => ("🇪🇸", "西班牙"),
        "IT" => ("🇮🇹", "意大利"),
        "SE" => ("🇸🇪", "瑞典"),
        "NO" => ("🇳🇴", "挪威"),
        "CH" => ("🇨🇭", "瑞士"),
        _ => ("🌐", "其他"),
    }
}

pub const VPNGATE_CACHE_RETENTION_SECS: u64 = 24 * 3600; // 24 hours

/// A cached VPNGate node record stored locally for 24-hour merging and deduplication.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VpngateNodeRecord {
    pub ip: String,
    pub port: u16,
    pub proto: String,
    pub country_short: String,
    pub score: u64,
    pub ping: u64,
    pub speed: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cipher: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth: Option<String>,
    pub ca: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cert: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    pub last_seen: u64,
}

pub fn vpngate_cache_path() -> Option<PathBuf> {
    let home = dirs_next::home_dir()?;
    Some(home.join(CORE_DIR).join("vpngate_cache.json"))
}

pub fn load_vpngate_cache() -> Vec<VpngateNodeRecord> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let seed_records = parse_vpngate_yaml_records(default_vpngate_yaml(), now);

    let mut cached_records = Vec::new();
    if let Some(path) = vpngate_cache_path() {
        if path.is_file() {
            if let Ok(bytes) = std::fs::read(&path) {
                if let Ok(records) = serde_json::from_slice::<Vec<VpngateNodeRecord>>(&bytes) {
                    cached_records = records;
                }
            }
        }
    }

    if cached_records.is_empty() {
        save_vpngate_cache(&seed_records);
        return seed_records;
    }

    cached_records
}

pub fn save_vpngate_cache(records: &[VpngateNodeRecord]) {
    if let Some(path) = vpngate_cache_path() {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(records) {
            let _ = std::fs::write(&path, json);
        }
    }
}

pub fn parse_vpngate_yaml_records(yaml: &str, now: u64) -> Vec<VpngateNodeRecord> {
    let mut records = Vec::new();
    let mut current_name = String::new();
    let mut current_server = String::new();
    let mut current_port = 443u16;
    let mut current_proto = "tcp".to_string();
    let mut current_cipher = None;
    let mut current_auth = None;
    let mut current_ca = String::new();
    let mut current_cert = String::new();
    let mut current_key = String::new();
    let mut active_block: Option<&str> = None;

    let flush_node = |recs: &mut Vec<VpngateNodeRecord>,
                      name: &str,
                      server: &str,
                      port: u16,
                      proto: &str,
                      cipher: &Option<String>,
                      auth: &Option<String>,
                      ca: &str,
                      cert: &str,
                      key: &str| {
        if !server.is_empty() && !ca.trim().is_empty() {
            let country_short = if name.contains("美国") || name.contains("🇺🇸") {
                "US"
            } else if name.contains("日本") || name.contains("🇯🇵") {
                "JP"
            } else if name.contains("韩国") || name.contains("🇰🇷") {
                "KR"
            } else if name.contains("德国") || name.contains("🇩🇪") {
                "DE"
            } else if name.contains("英国") || name.contains("🇬🇧") {
                "GB"
            } else if name.contains("新加坡") || name.contains("🇸🇬") {
                "SG"
            } else if name.contains("中国香港") || name.contains("🇭🇰") {
                "HK"
            } else if name.contains("中国台湾") || name.contains("🇨🇳") {
                "TW"
            } else {
                "OTHER"
            };

            recs.push(VpngateNodeRecord {
                ip: server.to_string(),
                port,
                proto: proto.to_string(),
                country_short: country_short.to_string(),
                score: 100_000,
                ping: 50,
                speed: 10_000_000,
                cipher: cipher.clone(),
                auth: auth.clone(),
                ca: ca.trim().to_string(),
                cert: if cert.trim().is_empty() { None } else { Some(cert.trim().to_string()) },
                key: if key.trim().is_empty() { None } else { Some(key.trim().to_string()) },
                last_seen: now,
            });
        }
    };

    for line in yaml.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("- name:") {
            flush_node(
                &mut records,
                &current_name,
                &current_server,
                current_port,
                &current_proto,
                &current_cipher,
                &current_auth,
                &current_ca,
                &current_cert,
                &current_key,
            );
            current_name = trimmed.trim_start_matches("- name:").trim().trim_matches('"').trim_matches('\'').to_string();
            current_server.clear();
            current_port = 443;
            current_proto = "tcp".to_string();
            current_cipher = None;
            current_auth = None;
            current_ca.clear();
            current_cert.clear();
            current_key.clear();
            active_block = None;
            continue;
        }

        if trimmed == "ca: |" {
            active_block = Some("ca");
            continue;
        } else if trimmed == "cert: |" {
            active_block = Some("cert");
            continue;
        } else if trimmed == "key: |" {
            active_block = Some("key");
            continue;
        }

        if let Some(block) = active_block {
            if line.starts_with("    ") || line.starts_with("      ") {
                let content = trimmed;
                match block {
                    "ca" => {
                        current_ca.push_str(content);
                        current_ca.push('\n');
                    }
                    "cert" => {
                        current_cert.push_str(content);
                        current_cert.push('\n');
                    }
                    "key" => {
                        current_key.push_str(content);
                        current_key.push('\n');
                    }
                    _ => {}
                }
                continue;
            } else {
                active_block = None;
            }
        }

        if trimmed.starts_with("server:") {
            current_server = trimmed.trim_start_matches("server:").trim().trim_matches('"').trim_matches('\'').to_string();
        } else if trimmed.starts_with("port:") {
            if let Ok(p) = trimmed.trim_start_matches("port:").trim().parse::<u16>() {
                current_port = p;
            }
        } else if trimmed.starts_with("proto:") {
            current_proto = trimmed.trim_start_matches("proto:").trim().trim_matches('"').trim_matches('\'').to_string();
        } else if trimmed.starts_with("cipher:") {
            current_cipher = Some(trimmed.trim_start_matches("cipher:").trim().trim_matches('"').trim_matches('\'').to_string());
        } else if trimmed.starts_with("auth:") {
            current_auth = Some(trimmed.trim_start_matches("auth:").trim().trim_matches('"').trim_matches('\'').to_string());
        }
    }

    flush_node(
        &mut records,
        &current_name,
        &current_server,
        current_port,
        &current_proto,
        &current_cipher,
        &current_auth,
        &current_ca,
        &current_cert,
        &current_key,
    );

    records
}

#[derive(Debug, Clone)]
pub struct ParsedOvpn {
    pub server: String,
    pub port: u16,
    pub proto: String,
    pub cipher: Option<String>,
    pub auth: Option<String>,
    pub ca: String,
    pub cert: Option<String>,
    pub key: Option<String>,
}

pub fn parse_ovpn_config(raw_ovpn: &str, fallback_ip: &str) -> Option<ParsedOvpn> {
    let mut server = fallback_ip.to_string();
    let mut port: u16 = 443;
    let mut proto = "tcp".to_string();
    let mut cipher = None;
    let mut auth = None;
    let mut ca = None;
    let mut cert = None;
    let mut key = None;

    let mut current_block: Option<&str> = None;
    let mut block_lines: Vec<&str> = Vec::new();

    for line in raw_ovpn.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("<ca>") {
            current_block = Some("ca");
            block_lines.clear();
            continue;
        } else if trimmed.starts_with("</ca>") {
            ca = Some(block_lines.join("\n").trim().to_string());
            current_block = None;
            continue;
        } else if trimmed.starts_with("<cert>") {
            current_block = Some("cert");
            block_lines.clear();
            continue;
        } else if trimmed.starts_with("</cert>") {
            cert = Some(block_lines.join("\n").trim().to_string());
            current_block = None;
            continue;
        } else if trimmed.starts_with("<key>") {
            current_block = Some("key");
            block_lines.clear();
            continue;
        } else if trimmed.starts_with("</key>") {
            key = Some(block_lines.join("\n").trim().to_string());
            current_block = None;
            continue;
        }

        if current_block.is_some() {
            block_lines.push(line);
            continue;
        }

        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        match parts[0].to_ascii_lowercase().as_str() {
            "remote" => {
                if parts.len() >= 2 {
                    let r_host = parts[1].trim();
                    if !r_host.is_empty() {
                        server = r_host.to_string();
                    }
                }
                if parts.len() >= 3 {
                    if let Ok(p) = parts[2].parse::<u16>() {
                        port = p;
                    }
                }
            }
            "port" => {
                if parts.len() >= 2 {
                    if let Ok(p) = parts[1].parse::<u16>() {
                        port = p;
                    }
                }
            }
            "proto" => {
                if parts.len() >= 2 {
                    let p = parts[1].to_ascii_lowercase();
                    if p.starts_with("tcp") {
                        proto = "tcp".to_string();
                    } else if p.starts_with("udp") {
                        proto = "udp".to_string();
                    }
                }
            }
            "cipher" => {
                if parts.len() >= 2 {
                    cipher = Some(parts[1].to_string());
                }
            }
            "data-ciphers" => {
                if cipher.is_none() && parts.len() >= 2 {
                    let c = parts[1].split(':').next().unwrap_or(parts[1]);
                    cipher = Some(c.to_string());
                }
            }
            "auth" => {
                if parts.len() >= 2 {
                    auth = Some(parts[1].to_string());
                }
            }
            _ => {}
        }
    }

    let ca_content = ca?;
    if ca_content.is_empty() {
        return None;
    }

    Some(ParsedOvpn {
        server,
        port,
        proto,
        cipher,
        auth,
        ca: ca_content,
        cert,
        key,
    })
}

pub fn parse_vpngate_csv_records(text: &str, now: u64) -> Vec<VpngateNodeRecord> {
    use base64::prelude::*;

    let mut records = Vec::new();
    let mut found_header = false;

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("#HostName") {
            found_header = true;
            continue;
        }
        if !found_header || trimmed.starts_with('*') || trimmed.is_empty() {
            continue;
        }

        let parts: Vec<&str> = trimmed.split(',').collect();
        // #HostName,IP,Score,Ping,Speed,CountryLong,CountryShort,NumVpnSessions,Uptime,TotalUsers,TotalTraffic,LogType,Operator,Message,OpenVPN_ConfigData_Base64
        if parts.len() < 15 {
            continue;
        }

        let ip = parts[1].trim();
        if ip.is_empty() {
            continue;
        }
        let score = parts[2].trim().parse::<u64>().unwrap_or(0);
        let ping = parts[3].trim().parse::<u64>().unwrap_or(0);
        let speed = parts[4].trim().parse::<u64>().unwrap_or(0);
        let country_short = parts[6].trim().to_uppercase();
        let b64 = parts[parts.len() - 1].trim();

        let ovpn_bytes = match BASE64_STANDARD.decode(b64.as_bytes()) {
            Ok(b) => b,
            Err(_) => continue,
        };
        let ovpn_text = match String::from_utf8(ovpn_bytes) {
            Ok(s) => s,
            Err(_) => continue,
        };

        if let Some(parsed) = parse_ovpn_config(&ovpn_text, ip) {
            records.push(VpngateNodeRecord {
                ip: parsed.server,
                port: parsed.port,
                proto: parsed.proto,
                country_short,
                score,
                ping,
                speed,
                cipher: parsed.cipher,
                auth: parsed.auth,
                ca: parsed.ca,
                cert: parsed.cert,
                key: parsed.key,
                last_seen: now,
            });
        }
    }

    records
}

/// Merges fresh records into the existing 24-hour pool.
/// Deduplicates by server IP:port and discards nodes older than 24 hours.
pub fn merge_vpngate_records(
    existing: Vec<VpngateNodeRecord>,
    fresh: Vec<VpngateNodeRecord>,
    now: u64,
) -> Vec<VpngateNodeRecord> {
    let mut map: std::collections::HashMap<String, VpngateNodeRecord> = std::collections::HashMap::new();

    // 1. Retain non-expired records seen in the last 24 hours
    for rec in existing {
        if now.saturating_sub(rec.last_seen) <= VPNGATE_CACHE_RETENTION_SECS {
            let key = format!("{}:{}", rec.ip, rec.port);
            map.insert(key, rec);
        }
    }

    // 2. Merge fresh records (deduplicate and update metrics)
    for rec in fresh {
        let key = format!("{}:{}", rec.ip, rec.port);
        map.insert(key, rec);
    }

    let mut result: Vec<VpngateNodeRecord> = map.into_values().collect();

    // Sort by country asc, then by score desc, then by ping asc
    result.sort_by(|a, b| {
        a.country_short
            .cmp(&b.country_short)
            .then_with(|| b.score.cmp(&a.score))
            .then_with(|| a.ping.cmp(&b.ping))
    });

    result
}

/// Renders cached records into Mihomo OpenVPN proxies YAML format.
pub fn generate_vpngate_yaml_from_records(records: &[VpngateNodeRecord]) -> String {
    let mut proxies = Vec::new();
    let mut country_counts: std::collections::HashMap<String, u32> = std::collections::HashMap::new();

    for rec in records {
        let (flag, country_name) = country_flag_and_name(&rec.country_short);
        let count = country_counts.entry(country_name.to_string()).or_insert(0);
        *count += 1;
        let node_name = format!("{flag} {country_name} - VPNGate {:02}", *count);

        let mut block = format!(
            "  - name: {:?}\n    type: openvpn\n    server: {:?}\n    port: {}\n    proto: {:?}\n    udp: true",
            node_name, rec.ip, rec.port, rec.proto
        );

        if let Some(c) = &rec.cipher {
            block.push_str(&format!("\n    cipher: {:?}", c));
        }
        if let Some(a) = &rec.auth {
            block.push_str(&format!("\n    auth: {:?}", a));
        }

        block.push_str("\n    ca: |\n");
        for line in rec.ca.lines() {
            block.push_str(&format!("      {}\n", line.trim()));
        }

        if let Some(cert) = &rec.cert {
            block.push_str("    cert: |\n");
            for line in cert.lines() {
                block.push_str(&format!("      {}\n", line.trim()));
            }
        }

        if let Some(key) = &rec.key {
            block.push_str("    key: |\n");
            for line in key.lines() {
                block.push_str(&format!("      {}\n", line.trim()));
            }
        }

        proxies.push(block.trim_end().to_string());
    }

    format!("proxies:\n{}", proxies.join("\n"))
}

/// Prunes records that match timed-out node names from local VPNGate cache.
pub fn prune_vpngate_timed_out_records(timed_out_names: &std::collections::HashSet<String>) {
    if timed_out_names.is_empty() {
        return;
    }
    let Some(yaml_path) = special_provider_path(BUILTIN_VPNGATE_ID) else { return };
    let mut ip_ports_to_remove = std::collections::HashSet::new();

    if let Ok(yaml) = std::fs::read_to_string(&yaml_path) {
        let mut cur_name = String::new();
        let mut cur_server = String::new();
        let mut cur_port = 0u16;

        for line in yaml.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("- name:") {
                if !cur_name.is_empty() && timed_out_names.contains(&cur_name) && !cur_server.is_empty() {
                    ip_ports_to_remove.insert((cur_server.clone(), cur_port));
                }
                cur_name = trimmed.trim_start_matches("- name:").trim().trim_matches('"').trim_matches('\'').to_string();
                cur_server.clear();
                cur_port = 0;
            } else if trimmed.starts_with("server:") {
                cur_server = trimmed.trim_start_matches("server:").trim().trim_matches('"').trim_matches('\'').to_string();
            } else if trimmed.starts_with("port:") {
                if let Ok(p) = trimmed.trim_start_matches("port:").trim().parse::<u16>() {
                    cur_port = p;
                }
            }
        }
        if !cur_name.is_empty() && timed_out_names.contains(&cur_name) && !cur_server.is_empty() {
            ip_ports_to_remove.insert((cur_server.clone(), cur_port));
        }
    }

    let cached = load_vpngate_cache();
    let before_count = cached.len();
    let filtered: Vec<_> = cached
        .into_iter()
        .filter(|r| {
            if ip_ports_to_remove.contains(&(r.ip.clone(), r.port)) {
                return false;
            }
            if timed_out_names.contains(&r.ip) {
                return false;
            }
            true
        })
        .collect();

    if filtered.len() < before_count {
        save_vpngate_cache(&filtered);
    }
}

/// Fetches VPNGate CSV list from official/mirror API, merges with the 24-hour cache
/// (excluding timed out nodes), and converts to clash proxies YAML.
pub fn fetch_and_generate_vpngate_yaml(
    client: &reqwest::blocking::Client,
    timed_out_names: &std::collections::HashSet<String>,
) -> Result<String, String> {
    prune_vpngate_timed_out_records(timed_out_names);

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let urls = [
        "http://www.vpngate.net/api/iphone/",
        "http://www.vpngate.net/api/iphone/?t=1",
        "https://www.vpngate.net/api/iphone/",
    ];

    let mut fresh_records = Vec::new();
    let mut last_err = None;

    for url in urls {
        match client.get(url).send() {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(text) = resp.text() {
                    let recs = parse_vpngate_csv_records(&text, now);
                    if !recs.is_empty() {
                        fresh_records = merge_vpngate_records(fresh_records, recs, now);
                    }
                }
            }
            Ok(resp) => {
                last_err = Some(format!("HTTP {}", resp.status()));
            }
            Err(e) => {
                last_err = Some(e.to_string());
            }
        }
    }

    let cached = load_vpngate_cache();

    if !fresh_records.is_empty() {
        let merged = merge_vpngate_records(cached, fresh_records, now);
        save_vpngate_cache(&merged);
        return Ok(generate_vpngate_yaml_from_records(&merged));
    }

    // Upstream fetch was not successful; fall back to non-expired cache if available
    let valid_cached: Vec<_> = cached
        .into_iter()
        .filter(|r| now.saturating_sub(r.last_seen) <= VPNGATE_CACHE_RETENTION_SECS)
        .collect();

    if !valid_cached.is_empty() {
        return Ok(generate_vpngate_yaml_from_records(&valid_cached));
    }

    Err(last_err.unwrap_or_else(|| "Could not fetch fresh nodes from VPNGate official API".to_string()))
}

/// Represents an individual proxy definition block in a Clash YAML configuration.
#[derive(Debug, Clone)]
pub struct RawProxyBlock {
    pub name: String,
    pub server: String,
    pub port: u16,
    pub lines: Vec<String>,
}

/// Parses raw clash yaml into individual proxy blocks.
pub fn parse_raw_proxy_blocks(yaml: &str) -> Vec<RawProxyBlock> {
    let mut blocks = Vec::new();
    let mut cur_name = String::new();
    let mut cur_server = String::new();
    let mut cur_port = 0u16;
    let mut cur_lines = Vec::new();

    let flush = |blocks: &mut Vec<RawProxyBlock>, name: &mut String, server: &mut String, port: &mut u16, lines: &mut Vec<String>| {
        if !name.is_empty() && !lines.is_empty() {
            blocks.push(RawProxyBlock {
                name: name.clone(),
                server: server.clone(),
                port: *port,
                lines: std::mem::take(lines),
            });
        }
        name.clear();
        server.clear();
        *port = 0;
    };

    let mut in_proxies = false;
    for line in yaml.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("proxies:") {
            in_proxies = true;
            continue;
        }
        if !in_proxies {
            continue;
        }
        if !line.starts_with(' ') && !line.starts_with('-') && !trimmed.is_empty() {
            break;
        }

        if trimmed.starts_with("- name:") {
            flush(&mut blocks, &mut cur_name, &mut cur_server, &mut cur_port, &mut cur_lines);
            let raw_val = trimmed.trim_start_matches("- name:").trim();
            cur_name = raw_val.trim_matches('"').trim_matches('\'').to_string();
            cur_lines.push(line.to_string());
        } else {
            if trimmed.starts_with("server:") {
                cur_server = trimmed.trim_start_matches("server:").trim().trim_matches('"').trim_matches('\'').to_string();
            } else if trimmed.starts_with("port:") {
                if let Ok(p) = trimmed.trim_start_matches("port:").trim().parse::<u16>() {
                    cur_port = p;
                }
            }
            if !cur_lines.is_empty() {
                cur_lines.push(line.to_string());
            }
        }
    }
    flush(&mut blocks, &mut cur_name, &mut cur_server, &mut cur_port, &mut cur_lines);
    blocks
}

/// Merges existing proxy blocks (excluding timed out nodes) with fresh proxy blocks, deduplicating by server:port.
pub fn merge_proxy_blocks(
    existing_blocks: Vec<RawProxyBlock>,
    fresh_blocks: Vec<RawProxyBlock>,
    timed_out_names: &std::collections::HashSet<String>,
) -> String {
    let mut result_blocks = Vec::new();
    let mut seen_keys = std::collections::HashSet::new();

    for b in existing_blocks {
        if timed_out_names.contains(&b.name) {
            continue;
        }
        let key = if !b.server.is_empty() && b.port > 0 {
            format!("{}:{}", b.server, b.port)
        } else {
            b.name.clone()
        };
        seen_keys.insert(key);
        result_blocks.push(b);
    }

    for b in fresh_blocks {
        let key = if !b.server.is_empty() && b.port > 0 {
            format!("{}:{}", b.server, b.port)
        } else {
            b.name.clone()
        };
        if seen_keys.insert(key) {
            result_blocks.push(b);
        }
    }

    let mut out = String::from("proxies:\n");
    for b in result_blocks {
        for l in b.lines {
            out.push_str(&l);
            out.push('\n');
        }
    }
    out
}

/// Cleans raw proxies list text and prefixes node names with target brand.
fn transform_proxies_yaml(raw_yaml: &str, brand: &str) -> Option<String> {
    if !raw_yaml.contains("proxies:") {
        return None;
    }

    let mut out_lines = Vec::new();
    let mut in_proxies = false;

    for line in raw_yaml.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("proxies:") {
            in_proxies = true;
            out_lines.push("proxies:".to_string());
            continue;
        }

        if !in_proxies {
            continue;
        }

        // Check if next section started
        if !line.starts_with(' ') && !line.starts_with('-') && !trimmed.is_empty() {
            break;
        }

        if trimmed.starts_with("- name:") {
            let raw_val = trimmed.trim_start_matches("- name:").trim();
            let mut name = raw_val.trim_matches('"').trim_matches('\'').to_string();
            // Strip any advertisement prefixes
            if let Some(pos) = name.find("dafei.de") {
                name = name[pos + 8..].trim().to_string();
            } else if let Some(pos) = name.find("机场推荐") {
                name = name[pos + 12..].trim().to_string();
            }

            // Ensure brand tag in name
            if !name.contains(brand) {
                if name.contains(" 0") {
                    name = name.replace(" 0", &format!(" - {brand} 0"));
                } else if name.contains(" 1") {
                    name = name.replace(" 1", &format!(" - {brand} 1"));
                } else {
                    name = format!("{name} - {brand}");
                }
            }

            let indent_len = line.len() - trimmed.len();
            let indent = " ".repeat(indent_len);
            out_lines.push(format!("{indent}- name: \"{name}\""));
        } else {
            out_lines.push(line.to_string());
        }
    }

    if out_lines.len() > 1 {
        Some(out_lines.join("\n"))
    } else {
        None
    }
}

/// Fetches and transforms nodes from online sources with fallback mirrors.
fn fetch_online_proxies(client: &reqwest::blocking::Client, urls: &[&str], brand: &str) -> Result<String, String> {
    for url in urls {
        if let Ok(resp) = client.get(*url).send() {
            if resp.status().is_success() {
                if let Ok(text) = resp.text() {
                    if let Some(yaml) = transform_proxies_yaml(&text, brand) {
                        return Ok(yaml);
                    }
                }
            }
        }
    }
    Err(format!("Could not fetch fresh nodes for {brand}"))
}

/// Fetches MegaV nodes from online clash mirrors, merges with existing surviving nodes.
pub fn fetch_and_generate_megav_yaml(
    client: &reqwest::blocking::Client,
    timed_out_names: &std::collections::HashSet<String>,
) -> Result<String, String> {
    let urls = [
        "https://raw.githubusercontent.com/ssrsub/ssr/master/clash.yaml",
        "https://ghfast.top/https://raw.githubusercontent.com/ssrsub/ssr/master/clash.yaml",
        "https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub",
    ];
    let existing_yaml = special_provider_path(BUILTIN_MEGAV_ID)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_else(|| default_megav_yaml().to_string());
    let existing_blocks = parse_raw_proxy_blocks(&existing_yaml);

    match fetch_online_proxies(client, &urls, "MegaV") {
        Ok(fresh_yaml) => {
            let fresh_blocks = parse_raw_proxy_blocks(&fresh_yaml);
            Ok(merge_proxy_blocks(existing_blocks, fresh_blocks, timed_out_names))
        }
        Err(e) => {
            let surviving = merge_proxy_blocks(existing_blocks, Vec::new(), timed_out_names);
            let count = surviving.lines().filter(|l| l.trim_start().starts_with("- name:")).count();
            if count > 0 {
                Ok(surviving)
            } else {
                Err(e)
            }
        }
    }
}

/// Fetches Psiphon nodes from online clash mirrors, merges with existing surviving nodes.
pub fn fetch_and_generate_psiphon_yaml(
    client: &reqwest::blocking::Client,
    timed_out_names: &std::collections::HashSet<String>,
) -> Result<String, String> {
    let urls = [
        "https://raw.githubusercontent.com/ssrsub/ssr/master/clash.yaml",
        "https://ghfast.top/https://raw.githubusercontent.com/ssrsub/ssr/master/clash.yaml",
    ];
    let existing_yaml = special_provider_path(BUILTIN_PSIPHON_ID)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .unwrap_or_else(|| default_psiphon_yaml().to_string());
    let existing_blocks = parse_raw_proxy_blocks(&existing_yaml);

    match fetch_online_proxies(client, &urls, "Psiphon") {
        Ok(fresh_yaml) => {
            let fresh_blocks = parse_raw_proxy_blocks(&fresh_yaml);
            Ok(merge_proxy_blocks(existing_blocks, fresh_blocks, timed_out_names))
        }
        Err(e) => {
            let surviving = merge_proxy_blocks(existing_blocks, Vec::new(), timed_out_names);
            let count = surviving.lines().filter(|l| l.trim_start().starts_with("- name:")).count();
            if count > 0 {
                Ok(surviving)
            } else {
                Err(e)
            }
        }
    }
}

/// Refreshes the YAML file for a special subscription by fetching upstream.
/// Retains non-timed-out nodes, removes timed-out nodes, and merges fresh nodes.
pub fn refresh_special_subscription_file(
    id: &str,
    timed_out_names: &std::collections::HashSet<String>,
) -> Result<usize, String> {
    let client_proxy = proxy_aware_client(35, true);
    let client_direct = proxy_aware_client(12, false);

    let fetch_with_client = |c: &reqwest::blocking::Client| match id {
        BUILTIN_VPNGATE_ID => fetch_and_generate_vpngate_yaml(c, timed_out_names),
        BUILTIN_MEGAV_ID => fetch_and_generate_megav_yaml(c, timed_out_names),
        BUILTIN_PSIPHON_ID => fetch_and_generate_psiphon_yaml(c, timed_out_names),
        _ => Err(format!("unknown special subscription id: {id}")),
    };

    let fresh_yaml = fetch_with_client(&client_proxy)
        .or_else(|_| fetch_with_client(&client_direct));

    let Some(path) = special_provider_path(id) else {
        return Err("cannot determine home directory".to_string());
    };

    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    match fresh_yaml {
        Ok(yaml) => {
            let processed_yaml = if id == BUILTIN_VPNGATE_ID {
                let transit_config = load_vpngate_transit_config();
                let target = vpngate_transit_target_name(&transit_config);
                apply_transit_to_vpngate_content(&yaml, target.as_deref())
            } else {
                yaml
            };
            std::fs::write(&path, &processed_yaml).map_err(|e| format!("could not save provider file: {e}"))?;
            let count = processed_yaml.lines().filter(|l| l.trim_start().starts_with("- name:")).count();
            Ok(count)
        }
        Err(_) => {
            // Prune timed-out nodes from existing file if upstream fetch failed
            let pruned_res = prune_special_subscription_file(id, timed_out_names);
            if let Ok(count) = pruned_res {
                if count > 0 {
                    return Ok(count);
                }
            }

            let needs_seed = if !path.is_file() {
                true
            } else {
                let existing = std::fs::read_to_string(&path).unwrap_or_default();
                existing.contains("198.51.100.") || existing.lines().filter(|l| l.trim_start().starts_with("- name:")).count() <= 10
            };

            if needs_seed {
                let seed_content = match id {
                    BUILTIN_PSIPHON_ID => default_psiphon_yaml().to_string(),
                    BUILTIN_VPNGATE_ID => {
                        let base = default_vpngate_yaml();
                        let transit_config = load_vpngate_transit_config();
                        let target = vpngate_transit_target_name(&transit_config);
                        apply_transit_to_vpngate_content(base, target.as_deref())
                    }
                    BUILTIN_MEGAV_ID => default_megav_yaml().to_string(),
                    _ => String::new(),
                };
                let _ = std::fs::write(&path, seed_content);
            }

            let existing = std::fs::read_to_string(&path).unwrap_or_default();
            let count = existing.lines().filter(|l| l.trim_start().starts_with("- name:")).count();
            if count > 0 {
                Ok(count)
            } else {
                Err("Unable to reach upstream servers and local cache is empty".to_string())
            }
        }
    }
}

/// Immediately prunes timed out nodes from a special subscription's provider file.
pub fn prune_special_subscription_file(
    id: &str,
    timed_out_names: &std::collections::HashSet<String>,
) -> Result<usize, String> {
    let Some(path) = special_provider_path(id) else {
        return Err("cannot determine home directory".to_string());
    };
    if id == BUILTIN_VPNGATE_ID {
        prune_vpngate_timed_out_records(timed_out_names);
        let cached = load_vpngate_cache();
        let yaml = generate_vpngate_yaml_from_records(&cached);
        let transit_config = load_vpngate_transit_config();
        let target = vpngate_transit_target_name(&transit_config);
        let processed_yaml = apply_transit_to_vpngate_content(&yaml, target.as_deref());
        std::fs::write(&path, &processed_yaml).map_err(|e| format!("could not save provider file: {e}"))?;
        let count = processed_yaml.lines().filter(|l| l.trim_start().starts_with("- name:")).count();
        Ok(count)
    } else {
        let existing_yaml = std::fs::read_to_string(&path)
            .unwrap_or_else(|_| match id {
                BUILTIN_PSIPHON_ID => default_psiphon_yaml().to_string(),
                BUILTIN_MEGAV_ID => default_megav_yaml().to_string(),
                _ => String::new(),
            });
        let existing_blocks = parse_raw_proxy_blocks(&existing_yaml);
        let pruned = merge_proxy_blocks(existing_blocks, Vec::new(), timed_out_names);
        std::fs::write(&path, &pruned).map_err(|e| format!("could not save provider file: {e}"))?;
        let count = pruned.lines().filter(|l| l.trim_start().starts_with("- name:")).count();
        Ok(count)
    }
}

/// Reads node summaries directly from the local provider YAML file.
pub fn parse_nodes_from_provider_yaml(id: &str) -> Vec<crate::mihomo::NodeInfo> {
    let Some(path) = special_provider_path(id) else {
        return Vec::new();
    };
    if !path.is_file() {
        let _ = ensure_special_provider_file(id);
    }
    let Ok(content) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };

    let mut nodes = Vec::new();
    let mut current_name = String::new();
    let mut current_type = String::from("SOCKS5");

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("- name:") {
            if !current_name.is_empty() {
                nodes.push(crate::mihomo::NodeInfo {
                    name: current_name.clone(),
                    kind: current_type.clone(),
                    alive: true,
                    delay: None,
                    speed: None,
                    exit_country: None,
                });
            }
            let raw = trimmed.trim_start_matches("- name:").trim();
            current_name = raw.trim_matches('"').trim_matches('\'').to_string();
            current_type = String::from("SOCKS5");
        } else if trimmed.starts_with("type:") {
            let raw = trimmed.trim_start_matches("type:").trim();
            current_type = raw.trim_matches('"').trim_matches('\'').to_uppercase();
        }
    }
    if !current_name.is_empty() {
        nodes.push(crate::mihomo::NodeInfo {
            name: current_name,
            kind: current_type,
            alive: true,
            delay: None,
            speed: None,
            exit_country: None,
        });
    }

    nodes
}

pub const VPNGATE_TRANSIT_PROXY_NAME: &str = "VPNGate-Transit-Proxy";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct VpngateTransitConfig {
    pub source: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subscription_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub node_name: Option<String>,
}

impl Default for VpngateTransitConfig {
    fn default() -> Self {
        Self {
            source: "direct".to_string(),
            proxy_id: None,
            proxy_url: None,
            proxy_name: None,
            subscription_id: None,
            subscription_name: None,
            node_name: None,
        }
    }
}

pub fn vpngate_transit_config_path() -> Option<PathBuf> {
    let home = dirs_next::home_dir()?;
    Some(home.join(CORE_DIR).join("vpngate_transit.json"))
}

pub fn load_vpngate_transit_config() -> VpngateTransitConfig {
    if let Some(path) = vpngate_transit_config_path() {
        if path.is_file() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<VpngateTransitConfig>(&content) {
                    return config;
                }
            }
        }
    }
    VpngateTransitConfig::default()
}

pub fn save_vpngate_transit_config(config: &VpngateTransitConfig) -> Result<(), String> {
    let Some(path) = vpngate_transit_config_path() else {
        return Err("cannot determine home directory".to_string());
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("cannot serialize transit config: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("cannot write transit config: {e}"))?;
    Ok(())
}

pub fn vpngate_transit_target_name(config: &VpngateTransitConfig) -> Option<String> {
    match config.source.as_str() {
        "direct" => None,
        "proxy" => Some(VPNGATE_TRANSIT_PROXY_NAME.to_string()),
        "subscription" | "psiphon" | "megav" => {
            config.node_name.as_ref().filter(|s| !s.trim().is_empty()).cloned()
        }
        _ => None,
    }
}

pub fn apply_transit_to_vpngate_content(content: &str, transit_target: Option<&str>) -> String {
    let mut out_lines = Vec::new();
    let mut in_proxies = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed == "proxies:" {
            in_proxies = true;
            out_lines.push(line.to_string());
            continue;
        }

        if in_proxies && trimmed.starts_with("dialer-proxy:") {
            continue;
        }

        if in_proxies && trimmed.starts_with("- name:") {
            out_lines.push(line.to_string());
            if let Some(target) = transit_target {
                if !target.trim().is_empty() {
                    out_lines.push(format!("    dialer-proxy: {:?}", target));
                }
            }
            continue;
        }

        out_lines.push(line.to_string());
    }

    out_lines.join("\n")
}

pub fn apply_vpngate_transit(transit_target: Option<&str>) -> Result<(), String> {
    let Some(path) = special_provider_path(BUILTIN_VPNGATE_ID) else {
        return Ok(());
    };
    if !path.is_file() {
        let _ = ensure_special_provider_file(BUILTIN_VPNGATE_ID);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("cannot read vpngate provider file: {e}"))?;
    let updated = apply_transit_to_vpngate_content(&content, transit_target);
    std::fs::write(&path, updated)
        .map_err(|e| format!("cannot write vpngate provider file: {e}"))?;
    Ok(())
}

pub fn proxy_url_to_mihomo_yaml(name: &str, url_str: &str) -> Option<String> {
    let url = reqwest::Url::parse(url_str).ok()?;
    let scheme = url.scheme().to_lowercase();
    let proxy_type = match scheme.as_str() {
        "http" | "https" => "http",
        "socks5" | "socks5h" | "socks" => "socks5",
        _ => return None,
    };
    let host = url.host_str()?;
    let port = url.port().unwrap_or(if proxy_type == "http" { 80 } else { 1080 });
    let username = url.username();
    let password = url.password().unwrap_or_default();

    let mut out = format!(
        "  - name: {:?}\n    type: {}\n    server: {:?}\n    port: {}",
        name, proxy_type, host, port
    );
    if !username.is_empty() {
        out.push_str(&format!("\n    username: {:?}", username));
    }
    if !password.is_empty() {
        out.push_str(&format!("\n    password: {:?}", password));
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_apply_transit_to_vpngate_content() {
        let input = "proxies:\n  - name: \"node1\"\n    type: socks5\n    server: \"1.1.1.1\"\n    port: 1080\n  - name: \"node2\"\n    type: socks5\n    server: \"2.2.2.2\"\n    port: 1080\n";
        let with_transit = apply_transit_to_vpngate_content(input, Some("my-relay"));
        assert!(with_transit.contains("dialer-proxy: \"my-relay\""));
        assert_eq!(with_transit.matches("dialer-proxy: \"my-relay\"").count(), 2);

        // Clearing transit removes dialer-proxy
        let cleared = apply_transit_to_vpngate_content(&with_transit, None);
        assert!(!cleared.contains("dialer-proxy"));
        assert!(cleared.contains("- name: \"node1\""));
    }

    #[test]
    fn test_merge_vpngate_records_24h_retention() {
        let now = 100_000u64;
        let old_rec = VpngateNodeRecord {
            ip: "1.1.1.1".to_string(),
            port: 443,
            proto: "tcp".to_string(),
            country_short: "JP".to_string(),
            score: 100,
            ping: 10,
            speed: 1000,
            cipher: None,
            auth: None,
            ca: "CA1".to_string(),
            cert: None,
            key: None,
            last_seen: now - (VPNGATE_CACHE_RETENTION_SECS + 10), // expired (> 24h)
        };
        let valid_rec = VpngateNodeRecord {
            ip: "2.2.2.2".to_string(),
            port: 443,
            proto: "tcp".to_string(),
            country_short: "US".to_string(),
            score: 200,
            ping: 20,
            speed: 2000,
            cipher: None,
            auth: None,
            ca: "CA2".to_string(),
            cert: None,
            key: None,
            last_seen: now - 3600, // 1h ago (< 24h)
        };
        let fresh_rec = VpngateNodeRecord {
            ip: "3.3.3.3".to_string(),
            port: 443,
            proto: "tcp".to_string(),
            country_short: "JP".to_string(),
            score: 300,
            ping: 30,
            speed: 3000,
            cipher: None,
            auth: None,
            ca: "CA3".to_string(),
            cert: None,
            key: None,
            last_seen: now,
        };
        let updated_valid_rec = VpngateNodeRecord {
            ip: "2.2.2.2".to_string(),
            port: 443,
            proto: "tcp".to_string(),
            country_short: "US".to_string(),
            score: 500, // score increased
            ping: 15,
            speed: 2500,
            cipher: None,
            auth: None,
            ca: "CA2_NEW".to_string(),
            cert: None,
            key: None,
            last_seen: now,
        };

        let merged = merge_vpngate_records(vec![old_rec, valid_rec], vec![fresh_rec, updated_valid_rec], now);
        // old_rec was evicted (>24h), valid_rec was updated with fresh metrics, fresh_rec was added
        assert_eq!(merged.len(), 2);
        assert!(merged.iter().any(|r| r.ip == "3.3.3.3"));
        let node2 = merged.iter().find(|r| r.ip == "2.2.2.2").unwrap();
        assert_eq!(node2.score, 500);
        assert_eq!(node2.ca, "CA2_NEW");
    }

    #[test]
    fn test_parse_ovpn_config() {
        let ovpn = r#"
client
dev tun
proto tcp
remote 219.100.37.109 443
cipher AES-128-CBC
auth SHA1
<ca>
-----BEGIN CERTIFICATE-----
TEST_CA
-----END CERTIFICATE-----
</ca>
<cert>
-----BEGIN CERTIFICATE-----
TEST_CERT
-----END CERTIFICATE-----
</cert>
<key>
-----BEGIN RSA PRIVATE KEY-----
TEST_KEY
-----END RSA PRIVATE KEY-----
</key>
"#;
        let parsed = parse_ovpn_config(ovpn, "127.0.0.1").unwrap();
        assert_eq!(parsed.server, "219.100.37.109");
        assert_eq!(parsed.port, 443);
        assert_eq!(parsed.proto, "tcp");
        assert_eq!(parsed.cipher, Some("AES-128-CBC".to_string()));
        assert_eq!(parsed.auth, Some("SHA1".to_string()));
        assert!(parsed.ca.contains("TEST_CA"));
        assert!(parsed.cert.unwrap().contains("TEST_CERT"));
        assert!(parsed.key.unwrap().contains("TEST_KEY"));
    }

    #[test]
    fn test_merge_proxy_blocks_pruning_and_dedup() {
        let existing_yaml = r#"
proxies:
  - name: "Node A"
    type: ss
    server: 1.1.1.1
    port: 8388
  - name: "Node B"
    type: ss
    server: 2.2.2.2
    port: 8388
"#;
        let fresh_yaml = r#"
proxies:
  - name: "Node B Fresh"
    type: ss
    server: 2.2.2.2
    port: 8388
  - name: "Node C"
    type: ss
    server: 3.3.3.3
    port: 8388
"#;
        let existing_blocks = parse_raw_proxy_blocks(existing_yaml);
        assert_eq!(existing_blocks.len(), 2);
        let fresh_blocks = parse_raw_proxy_blocks(fresh_yaml);
        assert_eq!(fresh_blocks.len(), 2);

        let mut timed_outs = std::collections::HashSet::new();
        timed_outs.insert("Node A".to_string());

        let merged = merge_proxy_blocks(existing_blocks, fresh_blocks, &timed_outs);
        let merged_blocks = parse_raw_proxy_blocks(&merged);

        // Node A is pruned, Node B is preserved, Node C is added, duplicate Node B Fresh is ignored
        assert_eq!(merged_blocks.len(), 2);
        assert_eq!(merged_blocks[0].name, "Node B");
        assert_eq!(merged_blocks[1].name, "Node C");
    }
}
