import { task, types } from "@nomiclabs/buidler/config";
import { constants, utils } from "ethers";

export default task(
  "deploy-gnosis-safe-and-exec-tx",
  `Sends tx to CPKFactory.createProxyAndExecTransaction() on Rinkeby`
)
  .addOptionalParam(
    "mastercopy",
    "The deployed implementation code the created proxy should point to"
  )
  .addOptionalParam(
    "saltnonce",
    "Supply for createTwoProxyAndSubmit()",
    // CPK global salt
    "0xcfe33a586323e7325be6aa6ecd8b4600d232a9037e83c8ece69413b777dabe65",
    types.string
  )
  .addOptionalParam("initializer", "Payload for gnosis safe proxy setup tasks")
  .addFlag("setup", "Initialize gnosis safe by calling its setup function")
  .addOptionalVariadicPositionalParam(
    "owners",
    "Supply with --setup: List of owners. Defaults to ethers signer."
  )
  .addOptionalParam(
    "threshold",
    "Supply with --setup: number of required confirmations for a Safe Tx.",
    1,
    types.int
  )
  .addOptionalParam(
    "to",
    "Supply with --setup: to address",
    constants.AddressZero
  )
  .addOptionalParam(
    "value",
    "Supply with --setup: value for execTransactions",
    0,
    types.int
  )
  .addOptionalParam(
    "data",
    "Supply with --setup: payload for optional delegate call",
    constants.HashZero
  )
  .addOptionalParam(
    "operation",
    "Supply with --setup: oepration type, default 1 delegate call",
    1,
    types.int
  )
  .addOptionalParam(
    "fallbackhandler",
    "Supply with --setup:  Handler for fallback calls to this contract",
    "0x40A930851BD2e590Bd5A5C981b436de25742E980",
    types.string
  )
  .addOptionalParam(
    "paymenttoken",
    "Supply with --setup:  Token that should be used for the payment (0 is ETH)",
    constants.AddressZero
  )
  .addOptionalParam(
    "payment",
    "Supply with --setup:  Value that should be paid",
    0,
    types.int
  )
  .addOptionalParam(
    "paymentreceiver",
    "Supply with --setup:  Adddress that should receive the payment (or 0 if tx.origin)t",
    constants.AddressZero
  )

  .addFlag("log", "Logs return values to stdout")
  .setAction(async (taskArgs) => {
    try {
      // Command Line Argument Checks
      // Gnosis Safe creation
      if (!taskArgs.initializer && !taskArgs.setup && !taskArgs.data)
        throw new Error("Must provide initializer payload or --setup args");
      else if (taskArgs.initializer && taskArgs.setup)
        throw new Error("Provide EITHER initializer payload OR --setup args");
      // Gelato User Proxy (GnosisSafeProxy) creation params
      if (!taskArgs.mastercopy) {
        taskArgs.mastercopy =
          config.networks.rinkeby.addressBook.gnosisSafe.mastercopy;
      }

      const user = config.networks.rinkeby.user();
      const userAddress = await user.getAddress();

      if (taskArgs.setup && !taskArgs.owners) {
        const signerAddress = userAddress;
        taskArgs.owners = [signerAddress];
        if (!Array.isArray(taskArgs.owners))
          throw new Error("Failed to convert taskArgs.owners into Array");
      }

      if (taskArgs.setup) {
        const inputs = [
          taskArgs.owners,
          taskArgs.threshold,
          taskArgs.to,
          taskArgs.data,
          taskArgs.fallbackhandler,
          taskArgs.paymenttoken,
          taskArgs.payment,
          taskArgs.paymentreceiver,
        ];
        taskArgs.initializer = await run("abi-encode-withselector", {
          contractname: "IGnosisSafe",
          functionname: "setup",
          inputs,
        });
      }
      // ============

      if (taskArgs.log) console.log("\nTaskArgs:\n", taskArgs, "\n");

      // CPKFactory interaction
      const cpkFactoryAddress =
        config.networks.rinkeby.addressBook.gnosisSafe.cpkFactory;

      if (taskArgs.log) console.log(`CPK Factory: ${cpkFactoryAddress}`);

      const cpkFactory = await run("instantiateContract", {
        address: cpkFactoryAddress,
        name: "CPKFactory",
        write: true,
        signer: user,
      });

      let creationTx = await cpkFactory.createProxyAndExecTransaction(
        taskArgs.mastercopy,
        taskArgs.saltnonce,
        taskArgs.fallbackhandler,
        taskArgs.to,
        taskArgs.value,
        taskArgs.data,
        taskArgs.operation,
        { gasLimit: 3000000 }
      );

      if (taskArgs.log)
        console.log(`\n Creation Tx Hash: ${creationTx.hash}\n
        \nhttps://rinkeby.etherscan.io/tx/${creationTx.hash}\n`);

      await creationTx.wait();

      // const { blockHash } = await creationTx.wait();

      // // Event Emission verification
      // if (taskArgs.log) {
      //   const parsedCreateLog = await run("event-getparsedlog", {
      //     contractname: "CPKFactory",
      //     contractaddress: cpkFactoryAddress,
      //     eventname: "ProxyCreation",
      //     txhash: creationTx.hash,
      //     blockHash,
      //     values: true,
      //     stringify: true,
      //   });
      //   if (parsedCreateLog)
      //     console.log("\n✅ ProxyCreation\n", parsedCreateLog);
      //   else console.log("\n❌ ProxyCreation not found");
      // }
      if (taskArgs.log) console.log(`Done ✅`);
      return creationTx.hash;
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });
