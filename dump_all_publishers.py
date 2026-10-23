import sys, unittest.mock, inspect
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')
sys.modules['service.user.media_user'] = unittest.mock.MagicMock()

mods = ['bilibili', 'kuaishou', 'toutiao', 'weibo', 'baijiahao', 'xiaohongshu']

for m in mods:
    mod = __import__(f'service.upload.{m}_upload', fromlist=[f'{m}_upload'])
    print(f'============================== {m.upper()} ==============================')
    for attr in dir(mod):
        obj = getattr(mod, attr)
        if inspect.isclass(obj) and attr.endswith('Uploader'):
            print(f'CLASS: {attr} (bases: {obj.__bases__})')
            # Look at class attributes
            for k, v in obj.__dict__.items():
                if not k.startswith('__'):
                    print(f'  ATTR {k}: {v}')
            # Check if there are default config attributes
            for k in dir(obj):
                if any(x in k for x in ['locator', 'button', 'selector', 'url', 'wait']):
                    print(f'  PROP {k}: {getattr(obj, k, None)}')
