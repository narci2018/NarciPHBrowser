import sys, unittest.mock, asyncio, inspect
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')
sys.modules['service.user.media_user'] = unittest.mock.MagicMock()

fake_login = unittest.mock.MagicMock()
fake_login.loginer_dict = {}
sys.modules['service.login'] = fake_login

import utils.upload_config as uc
uc.init_upload_config()

from service.upload import tiktok_upload

for name in ['set_thumbnail', 'set_schedule_time_tiktok', 'add_title_tags']:
    if hasattr(tiktok_upload, name):
        fn = getattr(tiktok_upload, name)
        print(f"=== {name} sig: {inspect.signature(fn)} ===")
