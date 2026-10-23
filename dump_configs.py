import sys, os
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')

import types
fake_media = types.ModuleType('service.user.media_user')
class DummyUser:
    def get_current_user_is_vip(self): return True
fake_media.media_user_service = DummyUser()
sys.modules['service.user.media_user'] = fake_media

import utils.upload_config as uc
import json

platforms = ['tiktok', 'douyin', 'weixin', 'bilibili', 'kuaishou', 'toutiao', 'weibo', 'baijiahao', 'xiaohongshu']
res = {}

for p in platforms:
    for t in ['video', 'image']:
        try:
            cfg = uc.get_upload_config(p, t)
            if hasattr(cfg, 'model_dump'):
                res[f'{p}_{t}'] = cfg.model_dump()
            elif hasattr(cfg, '__dict__'):
                res[f'{p}_{t}'] = {k: str(v) for k, v in cfg.__dict__.items()}
            else:
                res[f'{p}_{t}'] = str(cfg)
        except Exception as e:
            res[f'{p}_{t}'] = f'ERROR: {e}'

with open('all_upload_configs.json', 'w', encoding='utf-8') as f:
    json.dump(res, f, indent=2, ensure_ascii=False)

print("Dumped successfully to all_upload_configs.json")
