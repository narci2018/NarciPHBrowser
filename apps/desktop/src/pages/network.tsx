import { useState } from "react";
import type { ProfileSummary } from "@narc/sdk";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProxiesPage } from "@/pages/proxies";
import { SubscriptionsPage } from "@/pages/subscriptions";

interface NetworkPageProps {
  profiles: ProfileSummary[];
  /** Called after the proxy store changes, so usage columns can re-settle. */
  onProfilesChanged: () => void;
}

export function NetworkPage({ profiles, onProfilesChanged }: NetworkPageProps) {
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
            Proxy
          </TabsTrigger>
          <TabsTrigger value="subscription" className="h-6 px-3 text-xs">
            Subscription
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
    </Tabs>
  );
}
