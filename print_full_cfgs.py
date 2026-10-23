import json

cfg = json.load(open('fabuya_complete_upload_config.json', encoding='utf-8'))['upload_config']

print("=== Fabuya Complete Upload Config Summary ===")
for p, types in cfg.items():
    print(f"\nPlatform: {p}")
    for t, details in types.items():
        print(f"  Type: {t}")
        for k, v in details.items():
            print(f"    {k}: {v}")
