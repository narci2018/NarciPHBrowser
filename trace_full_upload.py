import sys, unittest.mock, asyncio, inspect
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')
sys.modules['service.user.media_user'] = unittest.mock.MagicMock()

fake_login = unittest.mock.MagicMock()
fake_login.loginer_dict = {}
sys.modules['service.login'] = fake_login

import utils.upload_config as uc
uc.init_upload_config()

from service.upload import tiktok_upload

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
            if item == 'count': return 1
            if item == 'is_enabled': return True
            if item == 'is_visible': return True
            return True
        if item in ['nth', 'locator', 'first', 'last']:
            return any_sync
        return any_async

class SmartMockKeyboard:
    async def press(self, key): trace.append(f'keyboard.press({key!r})')
    async def type(self, text, **kwargs): trace.append(f'keyboard.type({text!r})')
    async def insert_text(self, text): trace.append(f'keyboard.insert_text({text!r})')

class SmartMockPage:
    def __init__(self):
        self.keyboard = SmartMockKeyboard()
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
                return True
            return True
        if item in ['locator', 'get_by_text', 'get_by_role']:
            return any_sync
        return any_async

class SmartMockContext:
    def __getattr__(self, item):
        async def any_async(*args, **kwargs):
            trace.append(f'context.{item}({args})')
            return SmartMockPage()
        return any_async

async def run():
    uploader = tiktok_upload.TiktokVideoUploader()
    info_cls = uploader.get_upload_info_class()
    info = info_cls(
        user_id='1',
        video_path='C:/test/sample.mp4',
        title='My Great Video',
        summary='Check out this amazing video! #viral',
        tags=['fyp', 'trending'],
        type='video'
    )
    p = SmartMockPage()
    ctx = SmartMockContext()
    logger = unittest.mock.MagicMock()

    print("sig upload:", inspect.signature(uploader.upload))
    await uploader.upload(ctx, p, 30, logger, info)
    for t in trace:
        print(t)

asyncio.run(run())
