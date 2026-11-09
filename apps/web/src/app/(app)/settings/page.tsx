"use client";

import * as Switch from "@radix-ui/react-switch";
import { label } from "@workmesh/core";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { LoadingCards } from "@/components/ui/feedback";
import { TabPanel, Tabs } from "@/components/ui/overlay";
import { api, useAction, useApi, useMe } from "@/lib/hooks";

const DESCRIPTIONS: Record<string, string> = {
  BLOCKER_ASSIGNED: "A blocker is assigned to you",
  BLOCKER_CHANGED: "A blocker you reported, own or oversee changes",
  HELP_REQUESTED: "Someone asks you for help in an update",
  UPDATE_PUBLISHED: "Someone in your reporting line shares an update",
  UPDATE_ACKNOWLEDGED: "Someone acknowledges your update",
  COMMENT_ADDED: "Someone comments on your update or blocker",
  PROJECT_INVITED: "You're added to a project",
  MILESTONE_CHANGED: "A milestone in your project changes status",
  DECISION_ASSIGNED: "You own a recorded decision",
  ACTION_ITEM_ASSIGNED: "You're assigned an action item",
  DEADLINE_APPROACHING: "A milestone you own or lead is due within 3 days",
  MEETING_BRIEF_READY: "A meeting brief is shared with you",
  UPDATE_REQUESTED: "Your manager asks for a progress update",
  DEPENDENCY_CHANGED: "A dependency of a project you lead changes",
  PROJECT_STATUS_CHANGED: "A project you're on changes status",
  WORK_ASSIGNED: "Work is assigned to you",
  BLOCKER_ESCALATED: "An unowned serious blocker in your line needs an owner",
};

function SettingsInner() {
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") ?? "notifications");
  const { data: me } = useMe();
  const { data: prefs } = useApi<Array<{ type: string; inApp: boolean }>>("/notifications/preferences");
  const save = useAction((p: { type: string; inApp: boolean }) => api.put("/notifications/preferences", { preferences: [p] }), { success: "Preference saved", invalidate: ["/notifications/preferences"] });
  return (
    <>
      <PageHeader title="Settings" description={me ? `${me.user.name} · ${me.user.email}` : undefined} />
      <Tabs value={tab} onValueChange={setTab} tabs={[{ value: "notifications", label: "Notifications" }, { value: "profile", label: "Profile" }, { value: "privacy", label: "Privacy" }]}>
        <TabPanel value="notifications">
          <Card className="max-w-3xl">
            <CardHeader title="In-app notifications" description="Choose what reaches your notification center. Live refresh of pages you're viewing always continues." />
            <CardBody className="divide-y divide-line">
              {!prefs ? <LoadingCards count={1} /> : prefs.map((p) => (
                <div key={p.type} className="flex items-center justify-between gap-4 py-3">
                  <div><p className="text-[13.5px] font-medium">{label(p.type)}</p><p className="text-[12.5px] text-muted">{DESCRIPTIONS[p.type] ?? ""}</p></div>
                  <Switch.Root checked={p.inApp} onCheckedChange={(v) => save.mutate({ type: p.type, inApp: v })} aria-label={label(p.type)} className="relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-brand">
                    <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px]" />
                  </Switch.Root>
                </div>
              ))}
            </CardBody>
          </Card>
        </TabPanel>
        <TabPanel value="profile">
          <Card className="max-w-3xl"><CardBody className="pt-5 text-[13.5px]"><p>Your public profile — bio, responsibilities, location and contact — is edited from your profile page.</p>{me?.active && <ButtonLink href={`/people/${me.active.membershipId}`} variant="primary" className="mt-3">Open my profile</ButtonLink>}</CardBody></Card>
        </TabPanel>
        <TabPanel value="privacy">
          <Card className="max-w-3xl"><CardBody className="pt-5 text-[13.5px]"><p>WorkMesh shows only what you choose to share. Drafts and private updates are visible to you alone. Read how visibility works:</p><ButtonLink href="/privacy" className="mt-3">Privacy & trust</ButtonLink></CardBody></Card>
        </TabPanel>
      </Tabs>
    </>
  );
}

export default function SettingsPage() {
  return <Suspense><SettingsInner /></Suspense>;
}
