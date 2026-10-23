import sys, unittest.mock, asyncio, inspect, enum
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')
sys.modules['service.user.media_user'] = unittest.mock.MagicMock()

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
                return 1
            if item == 'all':
                return [MockLocator(f'{self.name}[0]'), MockLocator(f'{self.name}[1]')]
            if item == 'inner_text':
                return '立即投稿'
            if item == 'is_enabled':
                return True
            if item == 'is_visible':
                return True
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
            return MockLocator(f'loc({item})')
        async def any_async(*args, **kwargs):
            arg_str = ', '.join([repr(a) for a in args] + [f'{k}={repr(v)}' for k, v in kwargs.items()])
            trace.append(f'page.{item}({arg_str})')
            if item in ['locator', 'get_by_text', 'get_by_role']:
                return MockLocator(f'{item}({arg_str})')
            if item in ['wait_for_selector', 'query_selector']:
                return MockLocator(f'selector({arg_str})')
            return True
        if item in ['locator', 'get_by_text', 'get_by_role']:
            return any_sync
        return any_async

async def test_uploader(mod_name, uploader_name):
    mod = __import__(f'service.upload.{mod_name}_upload', fromlist=[f'{mod_name}_upload'])
    uploader_cls = getattr(mod, uploader_name)
    info_cls = uploader_cls.get_upload_info_class()
    if isinstance(info_cls, str):
        info_cls = getattr(mod, info_cls)
    
    fields = info_cls.model_fields.keys() if hasattr(info_cls, 'model_fields') else info_cls.__fields__.keys()
    init_kwargs = {}
    for f in fields:
        if 'user_id' in f: init_kwargs[f] = '1'
        elif 'video_path' in f: init_kwargs[f] = 'C:/test.mp4'
        elif 'image_path' in f: init_kwargs[f] = ['C:/test.jpg']
        elif 'title' in f: init_kwargs[f] = '测试作品标题'
        elif 'summary' in f or 'desc' in f or 'content' in f: init_kwargs[f] = '测试正文描述内容'
        elif 'tags' in f: init_kwargs[f] = ['热点', '分享']
        elif 'type' in f: init_kwargs[f] = 'video'
        elif 'topic' in f: init_kwargs[f] = '生活'
        elif 'zone' in f or 'tid' in f: init_kwargs[f] = 'vlog'
        else: init_kwargs[f] = None
    
    info = info_cls(**init_kwargs)
    p = MockPage()
    mock_logger = unittest.mock.MagicMock()
    
    print(f'################### {uploader_name} ###################')
    for method in ['enter_upload_page', 'upload_resource', 'fill_content', 'publish']:
        trace.clear()
        if hasattr(uploader_cls, method):
            fn = getattr(uploader_cls, method)
            sig = inspect.signature(fn)
            params = len(sig.parameters)
            try:
                if params == 4:
                    await asyncio.wait_for(fn(p, 30, mock_logger, {}), timeout=1.5)
                elif params == 5:
                    await asyncio.wait_for(fn(p, 30, mock_logger, info, {}), timeout=1.5)
                elif params == 2:
                    await asyncio.wait_for(fn(p, info), timeout=1.5)
                elif params == 1:
                    await asyncio.wait_for(fn(p), timeout=1.5)
            except Exception as e:
                trace.append(f'ERR: {type(e).__name__}: {e}')
            print(f'--- {method} ---')
            for t in trace:
                print(' ', t)

async def main():
    uploaders = [
        ('tiktok', 'TiktokVideoUploader'),
        ('bilibili', 'BilibiliVideoUploader'),
        ('kuaishou', 'KuaishouVideoUploader'),
        ('toutiao', 'ToutiaoVideoUploader'),
        ('weibo', 'WeiboVideoUploader'),
        ('baijiahao', 'BaijiahaoVideoUploader'),
        ('xiaohongshu', 'XiaohongshuVideoUploader'),
    ]
    for m, u in uploaders:
        try:
            await test_uploader(m, u)
        except Exception as e:
            print(f'FAIL {u}: {e}')

asyncio.run(main())
