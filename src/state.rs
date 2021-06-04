use solana_program::{
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

pub struct Escrow {
    pub is_initialized: bool,
    pub is_settled: bool,
    pub payer_pubkey: Pubkey,
    pub payee_pubkey: Pubkey,
    pub payer_temp_token_account_pubkey: Pubkey,
    pub authority_pubkey: Pubkey,
    pub fee_taker_pubkey: Pubkey,
    pub amount: u64,
    pub fee: u64,
}

impl Escrow {
    pub fn is_settled(&self) -> bool {
        self.is_settled
    }
}

use arrayref::{array_mut_ref, array_ref, array_refs, mut_array_refs};

impl Pack for Escrow {
    const LEN: usize = 178;
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, Escrow::LEN];
        let (
            is_initialized,
            is_settled,
            payer_pubkey,
            payee_pubkey,
            payer_temp_token_account_pubkey,
            authority_pubkey,
            fee_taker_pubkey,
            amount,
            fee,
        ) = array_refs![src, 1, 1, 32, 32, 32, 32, 32, 8, 8];
        let is_initialized = match is_initialized {
            [0] => false,
            [1] => true,
            _ => return Err(ProgramError::InvalidAccountData),
        };
        let is_settled = match is_settled {
            [0] => false,
            [1] => true,
            _ => return Err(ProgramError::InvalidAccountData),
        };
        Ok(Escrow {
            is_initialized,
            is_settled,
            payer_pubkey: Pubkey::new_from_array(*payer_pubkey),
            payee_pubkey: Pubkey::new_from_array(
                *payee_pubkey,
            ),
            payer_temp_token_account_pubkey: Pubkey::new_from_array(
                *payer_temp_token_account_pubkey,
            ),
            authority_pubkey: Pubkey::new_from_array(*authority_pubkey),
            fee_taker_pubkey: Pubkey::new_from_array(*fee_taker_pubkey),
            amount: u64::from_le_bytes(*amount),
            fee: u64::from_le_bytes(*fee),
        })
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dst = array_mut_ref![dst, 0, Escrow::LEN];
        let (
            is_initialized_dst,
            is_settled_dst,
            payer_pubkey_dst,
            payer_receiving_token_account_pubkey_dst,
            payer_temp_token_account_pubkey_dst,
            authority_pubkey_dst,
            fee_taker_pubkey_dst,
            expected_amount_dst,
            expected_fees_dst,
        ) = mut_array_refs![dst, 1, 1, 32, 32, 32, 32, 32, 8, 8];

        let Escrow {
            is_initialized,
            is_settled,
            payer_pubkey,
            payee_pubkey,
            payer_temp_token_account_pubkey,
            authority_pubkey,
            fee_taker_pubkey,
            amount,
            fee,
        } = self;

        is_initialized_dst[0] = *is_initialized as u8;
        is_settled_dst[0] = *is_settled as u8;
        payer_pubkey_dst.copy_from_slice(payer_pubkey.as_ref());
        payer_receiving_token_account_pubkey_dst
            .copy_from_slice(payee_pubkey.as_ref());
        payer_temp_token_account_pubkey_dst
            .copy_from_slice(payer_temp_token_account_pubkey.as_ref());
        authority_pubkey_dst.copy_from_slice(authority_pubkey.as_ref());
        fee_taker_pubkey_dst.copy_from_slice(fee_taker_pubkey.as_ref());
        *expected_amount_dst = amount.to_le_bytes();
        *expected_fees_dst = fee.to_le_bytes();
    }
}

impl Sealed for Escrow {}

impl IsInitialized for Escrow {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}
