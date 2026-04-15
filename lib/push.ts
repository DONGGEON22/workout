import webpush from "web-push";
import { getSupabase } from "@/lib/supabase";

let _configured = false;

function configurePush() {
  if (_configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const mailto = process.env.VAPID_MAILTO ?? "mailto:admin@workout.app";
  if (!pub || !priv) throw new Error("VAPID keys not set");
  webpush.setVapidDetails(mailto, pub, priv);
  _configured = true;
}

type PushPayload = { title: string; body: string; tag?: string };

export async function sendPushToMembers(memberIds: string[], payload: PushPayload) {
  if (!process.env.VAPID_PUBLIC_KEY) return;
  try { configurePush(); } catch { return; }

  const sb = getSupabase();
  const { data: subs } = await sb
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("member_id", memberIds);

  if (!subs?.length) return;

  const json = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          json,
        );
      } catch (e: unknown) {
        if (e && typeof e === "object" && "statusCode" in e && (e as { statusCode: number }).statusCode === 410) {
          await sb.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    }),
  );
}

export async function sendPushToAll(payload: PushPayload) {
  const sb = getSupabase();
  const { data: members } = await sb.from("members").select("id");
  if (!members?.length) return;
  await sendPushToMembers(members.map((m) => m.id), payload);
}
