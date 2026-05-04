import hre from "hardhat";

async function main() {
  console.log("Deploying RecordStorage contract...");
  const RecordStorage = await hre.ethers.getContractFactory("RecordStorage");
  const storage = await RecordStorage.deploy();

  await storage.waitForDeployment();

  const address = await storage.getAddress();
  console.log(`RecordStorage contract deployed to: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
