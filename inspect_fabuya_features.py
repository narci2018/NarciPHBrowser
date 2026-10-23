import sys, unittest.mock, inspect
sys.path.insert(0, r'c:\Tools2\fingerBrowsers2\NarciPHBrowser\发布鸭.exe_extracted')
sys.modules['service.user.media_user'] = unittest.mock.MagicMock()

print("--- Inspecting Models & Services ---")

from service.mix import mixing_params
print("\nMixingParams attributes:")
for k in dir(mixing_params):
    if not k.startswith('_'):
        print(f"  {k}: {getattr(mixing_params, k)}")

from service.mix import tts_service
print("\nTTSService attributes:")
for k in dir(tts_service):
    if not k.startswith('_'):
        print(f"  {k}: {getattr(tts_service, k)}")

from service.llm import llm_service
print("\nLLMService attributes:")
for k in dir(llm_service):
    if not k.startswith('_'):
        print(f"  {k}: {getattr(llm_service, k)}")
