import sys
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')

import types
fake_media = types.ModuleType('service.user.media_user')
class DummyUser:
    def get_current_user_is_vip(self): return True
fake_media.media_user_service = DummyUser()
sys.modules['service.user.media_user'] = fake_media

from service.activate.security import DataCipher

cipher = DataCipher()
with open(r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\duck_data\duck_static\upload_config.json', 'r', encoding='utf-8') as f:
    encrypted = f.read().strip()

decrypted_bytes = cipher.decrypt_data(encrypted)
# Save raw bytes directly to file
with open('pure_decrypted_config.json', 'wb') as f:
    f.write(decrypted_bytes)

print("Decrypted and wrote pure_decrypted_config.json successfully!")
