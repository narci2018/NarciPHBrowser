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

class MockLocator:
    def __init__(self, name):
        self.name = name
    def __getattr__(self, item):
        def any_sync(*args, **kwargs):
            arg_str = ', '.join([repr(a) for a in args] + [f'{k}={repr(v)}' for k, v in kwargs.items()])
            trace.append(f'{self.name}.{item}({arg_str})')
            return MockLocator(f'{self.name}->{item}')
        async def any_async(*args, **kwargs):
            arg_str = ', '.join([repr(a) for a in args] + [f'{k}={repr(v)}' for k, v in kwargs.items()])
            trace.append(f'{self.name}.{item}({arg_str})')
            if item == 'count':
                # return 1 so it executes inside branches
                return 1
            if item == 'is_enabled':
                return True
            if item == 'is_visible':
                return True
            if item == 'inner_text':
                return 'Post'
            if item == 'all':
                return [MockLocator(f'{self.name}[0]')]
            return True
        if item in ['nth', 'locator', 'first', 'last', 'get_by_text', 'get_by_role']:
            return any_sync
        return any_async

class MockKeyboard:
    async def press(self, key):
        trace.append(f'keyboard.press({key!r})')
    async def type(self, text, **kwargs):
        trace.append(f'keyboard.type({text!r})')
    async def insert_text(self, text):
        trace.append(f'keyboard.insert_text({text!r})')

class MockPage:
    def __init__(self):
        self.keyboard = MockKeyboard()
    def __getattr__(self, item):
        def any_sync(*args, **kwargs):
            arg_str = ', '.join([repr(a) for a in args] + [f'{k}={repr(v)}' for k, v in kwargs.items()])
            trace.append(f'page.{item}({arg_str})')
            return MockLocator(f'page.{item}({arg_str})')
        async def any_async(*args, **kwargs):
            arg_str = ', '.join([repr(a) for a in args] + [f'{k}={repr(v)}' for k, v in kwargs.items()])
            trace.append(f'page.{item}({arg_str})')
            if item in ['locator', 'get_by_text', 'get_by_role']:
                return MockLocator(f'page.{item}({arg_str})')
            if item in ['wait_for_selector', 'query_selector']:
                return MockLocator(f'page.{item}({arg_str})')
            if item == 'wait_for_url':
                # break out of while True loop on publish
                return True
            return True
        if item in ['locator', 'get_by_text', 'get_by_role']:
            return any_sync
        return any_async

async def run_tk():
    uploader_cls = tiktok_upload.TiktokVideoUploader
    info_cls = uploader_cls.get_upload_info_class()
    info = info_cls(
        user_id='1',
        video_path='C:/test/sample.mp4',
        title='My Great Video',
        summary='Check out this amazing video! #viral',
        tags=['fyp', 'trending'],
        type='video'
    )
    p = MockPage()
    mock_logger = unittest.mock.MagicMock()

    config = uc.get_upload_config('tiktok', 'video')
    print("TikTok Config:", config)

    print("===================== enter_upload_page =====================")
    trace.clear()
    await uploader_cls.enter_upload_page(p, 30, mock_logger, config)
    for t in trace: print(' ', t)

    print("===================== upload_resource =====================")
    trace.clear()
    await uploader_cls.upload_resource(p, 30, mock_logger, info, config)
    for t in trace: print(' ', t)

    print("===================== fill_content =====================")
    trace.clear()
    await uploader_cls.fill_content(p, 30, mock_logger, info, config)
    for t in trace: print(' ', t)

    print("===================== publish =====================")
    trace.clear()
    await uploader_cls.publish(p, 30, mock_logger, info, config)
    for t in trace: print(' ', t)

asyncio.run(run_tk())
