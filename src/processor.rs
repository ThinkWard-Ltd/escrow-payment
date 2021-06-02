use crate::{
    error::EscrowError::{
        ExpectedAmountMismatch, InvalidMintAddress, NotRentExempt, AmountOverflow, FeeOverflow
    },
    instruction::EscrowInstruction,
    state::Escrow,
};
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed}, 
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    sysvar::{rent::Rent, Sysvar},
};
use spl_token::state::Account as TokenAccount;

pub struct Processor;
impl Processor {
    pub fn process(
        program_id: &Pubkey,
        accounts: &[AccountInfo],
        instruction_data: &[u8],
    ) -> ProgramResult {
        let instruction = EscrowInstruction::unpack(instruction_data)?;

        match instruction {
            EscrowInstruction::InitEscrow { amount, fee } => {
                msg!("Instruction: InitEscrow");
                Self::process_init_escrow(accounts, amount, fee, program_id)
            }
            EscrowInstruction::Settle => {
                msg!("Instruction: Settle");
                Self::process_settlement(accounts, program_id)
            }
        }
    }

    fn process_init_escrow(
        accounts: &[AccountInfo],
        amount: u64,
        fees: u64,
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let payer_account = next_account_info(account_info_iter)?;

        if !payer_account.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let payer_receiving_token_account_pubkey = next_account_info(account_info_iter)?;

        let payer_temp_token_account = next_account_info(account_info_iter)?;
        if *payer_temp_token_account.owner != spl_token::id() {
            return Err(ProgramError::IncorrectProgramId);
        }

        let payer_temp_token_account_info = TokenAccount::unpack(&payer_temp_token_account.data.borrow())?;
        if payer_temp_token_account_info.amount != amount {
            msg!("Got Mismatched amount..., got: {} , expected {}", amount, payer_temp_token_account_info.amount);
            return Err(ExpectedAmountMismatch.into());
        }
        if fees > amount {
            msg!("Fee too high..., {} should be less than or equal to {}", fees, amount);
            return Err(FeeOverflow.into());
        }
        if !payer_temp_token_account_info.is_native() {
            if *payer_receiving_token_account_pubkey.owner != spl_token::id() {
                return Err(ProgramError::IncorrectProgramId);
            }    
            let payer_receiving_token_account_pubkey_info =
                TokenAccount::unpack(&payer_receiving_token_account_pubkey.data.borrow())?;
            if payer_temp_token_account_info.mint != payer_receiving_token_account_pubkey_info.mint {
                return Err(InvalidMintAddress.into());
            }
        }

        let authority = next_account_info(account_info_iter)?;
        if !authority.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let escrow_account = next_account_info(account_info_iter)?;
        let rent = &Rent::from_account_info(next_account_info(account_info_iter)?)?;

        if !rent.is_exempt(escrow_account.lamports(), escrow_account.data_len()) {
            return Err(NotRentExempt.into());
        }

        let mut escrow_info = Escrow::unpack_unchecked(&escrow_account.data.borrow())?;
        if escrow_info.is_initialized() {
            return Err(ProgramError::AccountAlreadyInitialized);
        }

        escrow_info.is_initialized = true;
        escrow_info.payer_pubkey = *payer_account.key;
        escrow_info.payer_receiving_token_account_pubkey = *payer_receiving_token_account_pubkey.key;
        escrow_info.payer_temp_token_account_pubkey = *payer_temp_token_account.key;
        escrow_info.authority_pubkey = *authority.key;
        escrow_info.amount = amount;

        Escrow::pack(escrow_info, &mut escrow_account.data.borrow_mut())?;
        let (pda, _bump_seed) = Pubkey::find_program_address(&[b"escrow"], program_id);

        let token_program = next_account_info(account_info_iter)?;
        let owner_change_ix = spl_token::instruction::set_authority(
            token_program.key,
            payer_temp_token_account.key,
            Some(&pda),
            spl_token::instruction::AuthorityType::AccountOwner,
            payer_account.key,
            &[&payer_account.key],
        )?;

        msg!("Calling the token program to transfer token account ownership...");
        invoke(
            &owner_change_ix,
            &[
                payer_temp_token_account.clone(),
                payer_account.clone(),
                token_program.clone(),
            ],
        )?;
        Ok(())
    }

    //inside: impl Processor {}
    fn process_settlement(
        accounts: &[AccountInfo],
        program_id: &Pubkey,
    ) -> ProgramResult {
        let account_info_iter = &mut accounts.iter();
        let authority = next_account_info(account_info_iter)?;

        if !authority.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }

        let takers_account = next_account_info(account_info_iter)?;
        let fee_taker_account = next_account_info(account_info_iter)?;

        let pdas_temp_token_account = next_account_info(account_info_iter)?;
        let pdas_temp_token_account_info =
            TokenAccount::unpack(&pdas_temp_token_account.data.borrow())?;

        let escrow_account = next_account_info(account_info_iter)?;
        let escrow_info = Escrow::unpack(&escrow_account.data.borrow())?;

        if escrow_info.authority_pubkey != *authority.key {
            return Err(ProgramError::InvalidAccountData);
        }

        if escrow_info.payer_temp_token_account_pubkey != *pdas_temp_token_account.key {
            return Err(ProgramError::InvalidAccountData);
        }

        let fee_payer_account = next_account_info(account_info_iter)?;
        let token_program = next_account_info(account_info_iter)?;


        let (pda, bump_seed) = Pubkey::find_program_address(&[b"escrow"], program_id);

        let pda_account = next_account_info(account_info_iter)?;
        if pda != *pda_account.key {
            return Err(ProgramError::InvalidAccountData);
        }

        let amount = pdas_temp_token_account_info.amount - escrow_info.fee;
        let fee = escrow_info.fee;

        if pdas_temp_token_account_info.is_native() {
            let close_pdas_temp_acc_ix = spl_token::instruction::close_account(
                token_program.key,
                pdas_temp_token_account.key,
                escrow_account.key,
                &pda,
                &[&pda],
            )?;
            msg!("Calling the token program to close pda's temp account...and add the remaining lamports to the escrow account");
            invoke_signed(
                &close_pdas_temp_acc_ix,
                &[
                    pdas_temp_token_account.clone(),
                    escrow_account.clone(),
                    pda_account.clone(),
                    token_program.clone(),
                ],
                &[&[&b"escrow"[..], &[bump_seed]]],
            )?;
            let source_starting_lamports = escrow_account.lamports();
            **escrow_account.lamports.borrow_mut() = source_starting_lamports
                .checked_sub(amount)
                .ok_or(AmountOverflow)?;

            let dest_starting_lamports = takers_account.lamports();
            **takers_account.lamports.borrow_mut() = dest_starting_lamports
                .checked_add(amount)
                .ok_or(AmountOverflow)?;
            
            if fee > 0 {
                let source_starting_lamports = escrow_account.lamports();
                **escrow_account.lamports.borrow_mut() = source_starting_lamports
                .checked_sub(fee)
                .ok_or(AmountOverflow)?;

                let dest_starting_lamports = fee_taker_account.lamports();
                **fee_taker_account.lamports.borrow_mut() = dest_starting_lamports
                    .checked_add(fee)
                    .ok_or(AmountOverflow)?;
            } 
        } else {
            let transfer_to_taker_ix = spl_token::instruction::transfer(
                token_program.key,
                pdas_temp_token_account.key,
                takers_account.key,
                &pda,
                &[&pda],
                amount,
            )?;
            msg!("Calling the token program to transfer tokens to the taker...");
            let seed = &b"escrow"[..];
            invoke_signed(
                &transfer_to_taker_ix,
                &[
                    pdas_temp_token_account.clone(),
                    takers_account.clone(),
                    pda_account.clone(),
                    token_program.clone(),
                ],
                &[&[seed, &[bump_seed]]],
            )?;
            if fee > 0 {
                let transfer_to_fee_taker_ix = spl_token::instruction::transfer(
                    token_program.key,
                    pdas_temp_token_account.key,
                    fee_taker_account.key,
                    &pda,
                    &[&pda],
                    fee,
                )?;
                msg!("Calling the token program to transfer tokens to the fee taker...");
                invoke_signed(
                    &transfer_to_fee_taker_ix,
                    &[
                        pdas_temp_token_account.clone(),
                        fee_taker_account.clone(),
                        pda_account.clone(),
                        token_program.clone(),
                    ],
                    &[&[seed, &[bump_seed]]],
                )?;
            }

            let close_pdas_temp_acc_ix = spl_token::instruction::close_account(
                token_program.key,
                pdas_temp_token_account.key,
                fee_payer_account.key,
                &pda,
                &[&pda],
            )?;
            msg!("Calling the token program to close pda's temp account...");
            invoke_signed(
                &close_pdas_temp_acc_ix,
                &[
                    pdas_temp_token_account.clone(),
                    fee_payer_account.clone(),
                    pda_account.clone(),
                    token_program.clone(),
                ],
                &[&[&b"escrow"[..], &[bump_seed]]],
            )?;
        }

        msg!("Closing the escrow account...");
        **fee_payer_account.lamports.borrow_mut() = fee_payer_account
            .lamports()
            .checked_add(escrow_account.lamports())
            .ok_or(AmountOverflow)?;
        **escrow_account.lamports.borrow_mut() = 0;
        *escrow_account.data.borrow_mut() = &mut [];
        Ok(())
    }
}
