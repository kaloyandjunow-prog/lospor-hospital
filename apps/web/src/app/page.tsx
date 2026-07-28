import { redirect } from "next/navigation"
import { getLiveSession } from "@/lib/live-session"

export default async function RootPage() {
  const session = await getLiveSession()
  redirect(session ? "/dashboard" : "/login")
}
