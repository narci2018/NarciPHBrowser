import sys, os
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')

import types
fake_media = types.ModuleType('service.user.media_user')
class DummyUser:
    def get_current_user_is_vip(self): return True
fake_media.media_user_service = DummyUser()
sys.modules['service.user.media_user'] = fake_media

import utils.upload_config as uc

print("base_dir:", uc.get_base_dir())
print("static_dir:", uc.get_static_dir())

try:
    print("Calling load_local_upload_config():")
    cfg = uc.load_local_upload_config()
    print("local config:", cfg)
except Exception as e:
    print("load_local error:", e)

try:
    print("Calling init_upload_config():")
    cfg2 = uc.init_upload_config()
    print("init config:", cfg2)
except Exception as e:
    print("init error:", e)

print("LOCAL_UPLOAD_CONFIG after:", uc.LOCAL_UPLOAD_CONFIG)
