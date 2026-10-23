import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProfileSummary } from "@narc/sdk";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProxiesPage } from "@/pages/proxies";
import { SpecialSubscriptionPage } from "@/pages/special-subscription";
import { SubscriptionsPage } from "@/pages/subscriptions";

interface NetworkPageProps {
  profiles: ProfileSummary[];
  /** Called after the proxy store changes, so usage columns can re-settle. */
  onProfilesChanged: () => void;
}

export function NetworkPage({ profiles, onProfilesChanged }: NetworkPageProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("proxy");

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <div className="flex items-center border-b border-border px-4 pt-2.5 pb-2.5">
        <TabsList className="h-8">
          <TabsTrigger value="proxy" className="h-6 px-3 text-xs">
            {t("common.proxyTab")}
          </TabsTrigger>
          <TabsTrigger value="subscription" className="h-6 px-3 text-xs">
            {t("common.subscriptionTab")}
          </TabsTrigger>
          <TabsTrigger value="psiphon" className="h-6 px-3 text-xs">
            Psiphon
          </TabsTrigger>
          <TabsTrigger value="vpngate" className="h-6 px-3 text-xs">
            VPNGate
          </TabsTrigger>
          <TabsTrigger value="megav" className="h-6 px-3 text-xs">
            MegaV
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        value="proxy"
        className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <ProxiesPage profiles={profiles} onProfilesChanged={onProfilesChanged} />
      </TabsContent>
      <TabsContent
        value="subscription"
        className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <SubscriptionsPage />
      </TabsContent>
      <TabsContent
        value="psiphon"
        className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <SpecialSubscriptionPage specialKey="psiphon" />
      </TabsContent>
      <TabsContent
        value="vpngate"
        className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <SpecialSubscriptionPage specialKey="vpngate" />
      </TabsContent>
      <TabsContent
        value="megav"
        className="mt-0 flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <SpecialSubscriptionPage specialKey="megav" />
      </TabsContent>
    </Tabs>
  );
}
