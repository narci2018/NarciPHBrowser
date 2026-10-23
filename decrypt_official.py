from cryptography.fernet import Fernet
import json

key = b'rEQrZzEps_MOSiLlzWehcQPV6b2RcLsEFfnKnZFh_8o='
cipher = Fernet(key)

with open(r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\duck_data\duck_static\upload_config.json', 'rb') as f:
    encrypted = f.read().strip()

decrypted = cipher.decrypt(encrypted)
# Test json parsing and re-dump as clean UTF-8
obj = json.loads(decrypted.decode('utf-8'))

with open('fabuya_official_decrypted_config.json', 'w', encoding='utf-8') as f:
    json.dump(obj, f, indent=2, ensure_ascii=False)

print("SUCCESSFULLY DECRYPTED OFFICIAL CONFIG TO fabuya_official_decrypted_config.json!")
