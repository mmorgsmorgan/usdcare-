alter table invoices drop constraint if exists invoices_chain_caip2_check;
update invoices set chain_caip2 = 'eip155:5042002' where chain_caip2 = 'eip155:8453';
update wallets set chain_caip2 = 'eip155:5042002' where chain_caip2 = 'eip155:8453';
update wallet_role_assignments set chain_caip2 = 'eip155:5042002' where chain_caip2 = 'eip155:8453';
alter table invoices add constraint invoices_chain_caip2_check check (chain_caip2 = 'eip155:5042002');
