import hre from "hardhat";

async function main() {
  console.log("Deploying Storage contract...");
  const Storage = await hre.ethers.getContractFactory("Storage");
  const storage = await Storage.deploy();

  await storage.waitForDeployment();

  const address = await storage.getAddress();
  console.log(`Storage contract deployed to: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
