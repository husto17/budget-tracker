"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, UserPlus, LogOut } from "lucide-react";

interface HouseholdMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface PendingInvite {
  id: string;
  token: string;
  household: {
    members: HouseholdMember[];
  };
}

interface Props {
  currentUserId: string;
  household: {
    id: string;
    members: HouseholdMember[];
  } | null;
  pendingInvite: PendingInvite | null;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function HouseholdSettings({ currentUserId, household, pendingInvite }: Props) {
  const router = useRouter();
  const [partnerEmail, setPartnerEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [accepting, setAccepting] = useState(false);

  async function handleInvite() {
    if (!partnerEmail) return;
    setInviting(true);
    try {
      const res = await fetch("/api/household", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partnerEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`Invite sent to ${partnerEmail}`);
        setPartnerEmail("");
        router.refresh();
      } else {
        toast.error(data.error ?? "Failed to send invite");
      }
    } finally {
      setInviting(false);
    }
  }

  async function handleLeave() {
    if (!confirm("Leave household? You will no longer see your partner's accounts.")) return;
    setLeaving(true);
    try {
      const res = await fetch("/api/household", { method: "DELETE" });
      if (res.ok) {
        toast.success("Left household");
        router.refresh();
      } else {
        toast.error("Failed to leave household");
      }
    } finally {
      setLeaving(false);
    }
  }

  async function handleAccept() {
    if (!pendingInvite) return;
    setAccepting(true);
    try {
      const res = await fetch("/api/household/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pendingInvite.token }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Joined household!");
        router.refresh();
      } else {
        toast.error(data.error ?? "Failed to accept invite");
      }
    } finally {
      setAccepting(false);
    }
  }

  // If already in a household
  if (household) {
    const partner = household.members.find((m) => m.id !== currentUserId);
    const me = household.members.find((m) => m.id === currentUserId);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Household
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">You are sharing finances with your household.</p>
          <div className="space-y-3">
            {me && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <Avatar className="w-9 h-9">
                  <AvatarFallback className="text-xs bg-blue-100 text-blue-700">
                    {getInitials(me.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{me.name} <span className="text-gray-400 dark:text-gray-500 font-normal">(you)</span></p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{me.email}</p>
                </div>
              </div>
            )}
            {partner ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                <Avatar className="w-9 h-9">
                  <AvatarFallback className="text-xs bg-green-100 text-green-700">
                    {getInitials(partner.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{partner.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{partner.email}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">Waiting for partner to accept invite...</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleLeave} disabled={leaving} className="text-red-600 border-red-200 hover:bg-red-50">
            <LogOut className="w-4 h-4 mr-2" />
            {leaving ? "Leaving..." : "Leave household"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pending invite banner */}
      {pendingInvite && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-5">
            <div className="flex items-start gap-3">
              <UserPlus className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900">
                  {pendingInvite.household.members[0]?.name ?? "Someone"} has invited you to join their household
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  You will be able to see each other&apos;s accounts and combined spending.
                </p>
                <Button size="sm" className="mt-3" onClick={handleAccept} disabled={accepting}>
                  {accepting ? "Accepting..." : "Accept invitation"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite partner */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Invite Partner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Invite your partner to join your household. You will both be able to see all accounts, transactions, and combined spending.
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Partner&apos;s email address</Label>
              <Input
                type="email"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
                placeholder="partner@example.com"
              />
            </div>
            <Button onClick={handleInvite} disabled={inviting || !partnerEmail}>
              <UserPlus className="w-4 h-4 mr-2" />
              {inviting ? "Sending invite..." : "Send invite"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
