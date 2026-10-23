import sys, unittest.mock, inspect
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')
sys.modules['service.user.media_user'] = unittest.mock.MagicMock()

fake_login = unittest.mock.MagicMock()
fake_login.loginer_dict = {}
sys.modules['service.login'] = fake_login

import utils.upload_config as uc
uc.init_upload_config()

from service.upload import base_upload

print("BaseUploader methods:")
for k in dir(base_upload.BaseUploader):
    if not k.startswith('__'):
        print(k)
