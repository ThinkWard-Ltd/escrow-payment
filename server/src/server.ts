

import * as Express from "express";
import {
  createAndTransferToAccountTx,
  createAssociatedTokenTx,
  initializePayment,
  createTransferBetweenSplTokenAccountsTx,
  getTransactionSignatureByMemo,
  sendPayment,
  settlePayment,
  nativeTransfer,
  closePayment,
  validateAddress,
} from "./handler";
const PORT = 8080;
const HOST = '0.0.0.0';

const app = Express();
app.use(Express.json())
app.post("/createAssociatedToken", createAssociatedTokenTx);
app.post("/createAndTransferToAccount", createAndTransferToAccountTx);
app.post("/createTransferBetweenSplTokenAccounts", createTransferBetweenSplTokenAccountsTx);
app.post("/initializePayment",initializePayment);
app.post("/sendPayment", sendPayment);
app.post("/settlePayment", settlePayment);
app.post("/closePayment", closePayment);
app.get("/validateAddress", validateAddress);
app.get("/transactionSignatureByMemo", getTransactionSignatureByMemo);
app.post("/nativeTransfer", nativeTransfer);

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);