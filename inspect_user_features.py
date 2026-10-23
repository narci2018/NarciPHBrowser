import sys, unittest.mock, inspect
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')

from service.user import base_user

print("=== BaseUser methods ===")
for m in dir(base_user.BaseUser):
    if not m.startswith('__'):
        print(f"  {m}: {getattr(base_user.BaseUser, m)}")

from service.user import tiktok_user
print("\n=== TiktokUser methods ===")
for m in dir(tiktok_user.TiktokUser):
    if not m.startswith('__'):
        print(f"  {m}: {getattr(tiktok_user.TiktokUser, m)}")

from service.user import douyin_user
print("\n=== DouyinUser methods ===")
for m in dir(douyin_user.DouyinUser):
    if not m.startswith('__'):
        print(f"  {m}: {getattr(douyin_user.DouyinUser, m)}")
