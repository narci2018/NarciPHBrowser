import sys, os, json
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')

import types
fake_media = types.ModuleType('service.user.media_user')
class DummyUser:
    def get_current_user_is_vip(self): return True
fake_media.media_user_service = DummyUser()
sys.modules['service.user.media_user'] = fake_media

import utils.upload_config as uc

uc.init_upload_config()
with open('fabuya_complete_upload_config.json', 'w', encoding='utf-8') as f:
    json.dump(uc.LOCAL_UPLOAD_CONFIG, f, indent=2, ensure_ascii=False)

print("Saved fabuya_complete_upload_config.json successfully!")
