import sys, unittest.mock, asyncio, inspect
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')
sys.modules['service.user.media_user'] = unittest.mock.MagicMock()
from service.upload import tiktok_upload

trace = []

class MockLocator:
    def __init__(self, name):
        self.name = name
    def __getattr__(self, item):
        def any_sync(*args, **kwargs):
            trace.append(f'{self.name}.{item}({args})')
            return MockLocator(f'{self.name}.{item}')
        async def any_async(*args, **kwargs):
            trace.append(f'{self.name}.{item}({args}, {kwargs})')
            if item == 'count':
                if 'dialog' in self.name:
                    return 1
                return 0
            if item == 'inner_text':
                return 'Post'
            if item == 'is_enabled':
                return True
            return True
        if item in ['nth', 'locator', 'first', 'last']:
            return any_sync
        return any_async

class MockKeyboard:
    async def press(self, key):
        trace.append(f'keyboard.press({key})')
    async def type(self, text):
        trace.append(f'keyboard.type({text})')
    async def insert_text(self, text):
        trace.append(f'keyboard.insert_text({text})')

class MockPage:
    def __init__(self):
        self.keyboard = MockKeyboard()
    async def wait_for_url(self, url, **kwargs):
        trace.append(f'page.wait_for_url({url}, {kwargs})')
        raise TimeoutError("timeout waiting for url")
    def __getattr__(self, item):
        trace.append(f'PAGE_GET page.{item}')
        async def any_async(*args, **kwargs):
            trace.append(f'PAGE_CALL page.{item}({args}, {kwargs})')
            if item in ['locator', 'get_by_text', 'get_by_role']:
                return MockLocator(f'{item}({args})')
            return True
        def any_sync(*args, **kwargs):
            trace.append(f'PAGE_SYNC page.{item}({args}, {kwargs})')
            return MockLocator(f'{item}({args})')
        if item in ['locator', 'get_by_text', 'get_by_role']:
            return any_sync
        return any_async

async def main():
    p = MockPage()
    uploader = tiktok_upload.TiktokVideoUploader
    mock_info = tiktok_upload.TiktokUploadVideoInfo(
        user_id="1",
        video_path="C:/test.mp4",
        title="test title",
        summary="test summary",
        tags=["tag1", "tag2"],
    )
    mock_logger = unittest.mock.MagicMock()
    print("--- TRACING publish ---")
    try:
        await asyncio.wait_for(uploader.publish(p, 30, mock_logger, mock_info, {}), timeout=3.0)
    except Exception as e:
        print("publish exception:", e)
    for t in trace:
        print(" ", t)

asyncio.run(main())
