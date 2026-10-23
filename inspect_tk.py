import sys, inspect
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')

import types
fake_media = types.ModuleType('service.user.media_user')
class DummyUser:
    def get_current_user_is_vip(self): return True
fake_media.media_user_service = DummyUser()
sys.modules['service.user.media_user'] = fake_media

from service.upload import tiktok_upload

cls = tiktok_upload.TiktokVideoUploader
print("TiktokVideoUploader methods:")
for m in dir(cls):
    if not m.startswith('__'):
        print(m)
