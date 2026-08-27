import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const outputDirectory = path.join(repositoryRoot, "apps/web/src/contracts");

const contracts = [
  ["USDCareProviderRegistry", "USDCareProviderRegistry.sol"],
  ["USDCarePaymentRouter", "USDCarePaymentRouter.sol"],
  ["USDCareTreatmentEscrow", "USDCareTreatmentEscrow.sol"],
  ["USDCareTreatmentEscrowV2", "USDCareTreatmentEscrowV2.sol"],
];

await mkdir(outputDirectory, { recursive: true });

for (const [contractName, sourceName] of contracts) {
  const artifactPath = path.join(repositoryRoot, "contracts/out", sourceName, `${contractName}.json`);
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const exportedArtifact = {
    contractName,
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
  };

  await writeFile(
    path.join(outputDirectory, `${contractName}.json`),
    `${JSON.stringify(exportedArtifact)}\n`,
  );
}
