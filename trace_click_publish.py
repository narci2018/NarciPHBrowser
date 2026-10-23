import sys, unittest.mock, asyncio, inspect
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')
sys.modules['service.user.media_user'] = unittest.mock.MagicMock()

fake_login = unittest.mock.MagicMock()
fake_login.loginer_dict = {}
sys.modules['service.login'] = fake_login

import utils.upload_config as uc
uc.init_upload_config()

from service.upload import tiktok_upload

# Let's inspect click_publish
fn = tiktok_upload.click_publish
print("click_publish func:", fn)
print("signature:", inspect.signature(fn))

trace = []

class SmartMockLocator:
    def __init__(self, name):
        self.name = name
    def __getattr__(self, item):
        def any_sync(*args, **kwargs):
            arg_str = ', '.join([repr(a) for a in args] + [f'{k}={repr(v)}' for k, v in kwargs.items()])
            trace.append(f'{self.name}.{item}({arg_str})')
            return SmartMockLocator(f'{self.name}->{item}')
        async def any_async(*args, **kwargs):
            arg_str = ', '.join([repr(a) for a in args] + [f'{k}={repr(v)}' for k, v in kwargs.items()])
            trace.append(f'{self.name}.{item}({arg_str})')
            if item == 'count':
                return 1
            if item == 'is_enabled':
                return True
            return True
        if item in ['nth', 'locator', 'first', 'last']:
            return any_sync
        return any_async

class SmartMockPage:
    def __init__(self):
        self.loop_count = 0
    def __getattr__(self, item):
        def any_sync(*args, **kwargs):
            arg_str = ', '.join([repr(a) for a in args] + [f'{k}={repr(v)}' for k, v in kwargs.items()])
            trace.append(f'page.{item}({arg_str})')
            return SmartMockLocator(f'page.{item}({arg_str})')
        async def any_async(*args, **kwargs):
            arg_str = ', '.join([repr(a) for a in args] + [f'{k}={repr(v)}' for k, v in kwargs.items()])
            trace.append(f'page.{item}({arg_str})')
            if item in ['locator', 'get_by_text', 'get_by_role']:
                return SmartMockLocator(f'page.{item}({arg_str})')
            if item == 'wait_for_url':
                # Return True after 1st loop to end while loop
                return True
            return True
        if item in ['locator', 'get_by_text', 'get_by_role']:
            return any_sync
        return any_async

async def run():
    p = SmartMockPage()
    logger = unittest.mock.MagicMock()
    await fn(p)
    for t in trace:
        print(t)

asyncio.run(run())
