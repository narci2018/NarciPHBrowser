import sys, unittest.mock, json
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')
sys.modules['service.user.media_user'] = unittest.mock.MagicMock()
fake_login = unittest.mock.MagicMock()
fake_login.loginer_dict = {}
sys.modules['service.login'] = fake_login

import utils.upload_config as uc
uc.init_upload_config()

with open('fabuya_perfect_chinese_config.json', 'w', encoding='utf-8') as f:
    json.dump(uc.LOCAL_UPLOAD_CONFIG, f, indent=2, ensure_ascii=False)

print("Saved fabuya_perfect_chinese_config.json with perfect UTF-8 encoding!")
