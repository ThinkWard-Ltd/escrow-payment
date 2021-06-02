use solana_program::{
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
};

pub struct Escrow {
    pub is_initialized: bool,
    pub payer_pubkey: Pubkey,
    pub payer_receiving_token_account_pubkey: Pubkey,
    pub payer_temp_token_account_pubkey: Pubkey,
    pub authority_pubkey: Pubkey,
    pub amount: u64,
    pub fee: u64,
}

use arrayref::{array_mut_ref, array_ref, array_refs, mut_array_refs};

impl Pack for Escrow {
    const LEN: usize = 145;
    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, Escrow::LEN];
        let (
            is_initialized,
            payer_pubkey,
            payer_receiving_token_account_pubkey,
            payer_temp_token_account_pubkey,
            authority_pubkey,
            amount,
            fee
        ) = array_refs![src, 1, 32, 32, 32, 32, 8, 8];
        let is_initialized = match is_initialized {
            [0] => false,
            [1] => true,
            _ => return Err(ProgramError::InvalidAccountData),
        };

        Ok(Escrow {
            is_initialized,
            payer_pubkey: Pubkey::new_from_array(*payer_pubkey),
            payer_receiving_token_account_pubkey: Pubkey::new_from_array(*payer_receiving_token_account_pubkey),
            payer_temp_token_account_pubkey: Pubkey::new_from_array(*payer_temp_token_account_pubkey),
            authority_pubkey: Pubkey::new_from_array(*authority_pubkey),
            amount: u64::from_le_bytes(*amount),
            fee: u64::from_le_bytes(*fee),
        })
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        let dst = array_mut_ref![dst, 0, Escrow::LEN];
        let (
            is_initialized_dst,
            payer_pubkey_dst,
            payer_receiving_token_account_pubkey_dst,
            payer_temp_token_account_pubkey_dst,
            authority_pubkey_dst,
            expected_amount_dst,
            expected_fees_dst,
        ) = mut_array_refs![dst, 1, 32, 32, 32, 32, 8, 8];

        let Escrow {
            is_initialized,
            payer_pubkey,
            payer_receiving_token_account_pubkey,
            payer_temp_token_account_pubkey,
            authority_pubkey,
            amount,
            fee
        } = self;

        is_initialized_dst[0] = *is_initialized as u8;
        payer_pubkey_dst.copy_from_slice(payer_pubkey.as_ref());
        payer_receiving_token_account_pubkey_dst.copy_from_slice(payer_receiving_token_account_pubkey.as_ref());
        payer_temp_token_account_pubkey_dst.copy_from_slice(payer_temp_token_account_pubkey.as_ref());
        authority_pubkey_dst.copy_from_slice(authority_pubkey.as_ref());
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
