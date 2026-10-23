import sys, unittest.mock, asyncio, inspect
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')
sys.modules['service.user.media_user'] = unittest.mock.MagicMock()
fake_login = unittest.mock.MagicMock()
fake_login.loginer_dict = {}
sys.modules['service.login'] = fake_login

import utils.upload_config as uc
uc.init_upload_config()

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
            if item == 'inner_text': return '发布'
            return True
        if item in ['nth', 'locator', 'first', 'last']:
            return any_sync
        return any_async

class SmartMockPage:
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

uploaders = [
    ('douyin', 'DouyinVideoUploader'),
    ('bilibili', 'BilibiliVideoUploader'),
    ('kuaishou', 'KuaishouVideoUploader'),
    ('toutiao', 'ToutiaoVideoUploader'),
    ('weibo', 'WeiboVideoUploader'),
    ('baijiahao', 'BaijiahaoVideoUploader'),
    ('xiaohongshu', 'XiaohongshuVideoUploader'),
    ('weixin', 'WeixinVideoUploader'),
]

async def check_real_immediate():
    for mod_name, u_name in uploaders:
        mod = __import__(f'service.upload.{mod_name}_upload', fromlist=[f'{mod_name}_upload'])
        cls = getattr(mod, u_name)
        config = uc.get_upload_config(mod_name, 'video')
        p = SmartMockPage()
        logger = unittest.mock.MagicMock()
        info_cls = cls.get_upload_info_class()
        if isinstance(info_cls, str): info_cls = getattr(mod, info_cls)
        
        init_args = {'user_id': '1'}
        if hasattr(info_cls, 'model_fields'):
            for k in info_cls.model_fields.keys():
                init_args[k] = None
        else:
            for k in info_cls.__fields__.keys():
                init_args[k] = None
        init_args['user_id'] = '1'
        init_args['upload_type'] = 'video'
        init_args['video_path'] = 'C:/test.mp4'
        init_args['upload_date'] = None
        info = info_cls(**init_args)
        
        trace.clear()
        print(f"\n==================== {u_name} REAL IMMEDIATE ====================")
        sig = inspect.signature(cls.publish)
        params = len(sig.parameters)
        try:
            if params == 5:
                await cls.publish(p, 30, logger, info, config)
            elif params == 4:
                await cls.publish(p, 30, logger, config)
            elif params == 3:
                await cls.publish(p, 30, logger)
            elif params == 1:
                await cls.publish(p)
        except Exception as e:
            trace.append(f"ERR: {type(e).__name__}: {e}")
        for t in trace:
            print(" ", t)

asyncio.run(check_real_immediate())
