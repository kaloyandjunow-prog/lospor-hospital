export function assertContractPackageLock(contractPackage, contractLock) {
  if (
    contractLock?.name !== contractPackage?.name
    || contractLock?.version !== contractPackage?.version
    || contractLock?.packages?.[""]?.name !== contractPackage?.name
    || contractLock?.packages?.[""]?.version !== contractPackage?.version
  ) {
    throw new Error(
      "Vendored exchange contract package-lock metadata does not match package.json",
    )
  }
}
