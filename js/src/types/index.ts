
export interface CreateAssociatedTokenInput {
    walletAddress: string;
    tokenMintAddress: string;
    recentBlockhash: string;
}


export interface CreateAssociatedTokenOutput {
    address: string;
    message: string;
    signatures: string[];
}

export interface TransferOutput {
    message: string;
    signatures: string[];
}


export interface CreateAndTransferToAccountInput {
    walletAddress: string;
    tokenMintAddress: string;
    sourcePublicKey: string;
    destinationPublicKey: string;
    amount: number;
    recentBlockhash: string;
    memo?: string;
}

export interface NativeTransferInput {
    walletAddress: string;
    destinationPublicKey: string;
    recentBlockhash: string;
    amount: number;
}

export interface InitializePaymentInput {
    walletAddress: string;
    tokenAccountAddress: string;
    tokenMintAddress: string;
}

export interface InitializePaymentOutput {
    message: string;
    signatures: Sig[];
    escrowAddress: string;
}

export interface SendPaymentInput {
    message: string;
    signatures: Sig[];
    orderId: string;
}

export interface Sig {
    pubKey: string;
    signature?: string | null;
}

export interface InitializePaymentInput {
    walletAddress: string;
    tokenAccountAddress: string;
    tokenMintAddress: string;
    amount: number;
    memo?: string;
}

export interface SendPaymentInput {
    message: string;
    signatures: Sig[];
}

export interface SettlePaymentInput {
    walletAddress: string;
    amount: number;
    escrowAddress: string
    memo?: string;
    fee?: number;
}

export interface ClosePaymentInput {
    escrowAddress: string
    memo?: string;
}

export interface SettlePaymentOutput {
    signature: string,
    destinationWalletAddress: string
}

export interface GetTransactionSignatureByMemoInpt {
    walletAddress: string;
    until?: string;
    memo: string;
}

