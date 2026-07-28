import { redirect } from "next/navigation"
import { currentSession } from "@/lib/api"

export default async function HomePage() {
  redirect((await currentSession()) ? "/overview" : "/login")
}
