const [component, expectedStatus, requirement] = process.argv.slice(2)
if (!component || !expectedStatus) throw new Error("Usage: assert-status-component COMPONENT STATUS")
process.stdin.setEncoding("utf8")
let input = ""
for await (const chunk of process.stdin) input += chunk
const parsed = JSON.parse(input)
const match = Array.isArray(parsed?.components)
  && parsed.components.some(item => item?.component === component && item?.status === expectedStatus)
const incidentMatch = requirement !== "--incident"
  || (Array.isArray(parsed?.incidents)
    && parsed.incidents.some(item => item?.component === component))
if (!match || !incidentMatch) process.exit(1)
