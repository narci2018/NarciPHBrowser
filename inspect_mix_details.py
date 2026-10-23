import sys, unittest.mock, inspect
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')
sys.modules['service.user.media_user'] = unittest.mock.MagicMock()

from service.mix import mixing_params

def dump_cls(cls):
    print(f"\n=== Class: {cls.__name__} ===")
    if hasattr(cls, 'model_fields'):
        for name, field in cls.model_fields.items():
            print(f"  {name}: {field.annotation} (default={field.default})")
    elif hasattr(cls, '__fields__'):
        for name, field in cls.__fields__.items():
            print(f"  {name}: {field.type_} (default={field.default})")

for name in ['MixingBasicParams', 'MixingClipsParams', 'MixingNarrationParams', 'MixingScriptParams', 'ClipsParams']:
    if hasattr(mixing_params, name):
        dump_cls(getattr(mixing_params, name))

from service.llm import llm_service
print("\n=== LLM Service ===")
for m in dir(llm_service):
    if not m.startswith('_'):
        obj = getattr(llm_service, m)
        print(f"  {m}: {type(obj)} {obj}")
