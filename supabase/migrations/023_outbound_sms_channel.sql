-- Add the direct-SMS channel to outbound_log. Safe to run twice.
alter table outbound_log drop constraint if exists outbound_log_channel_check;
alter table outbound_log add constraint outbound_log_channel_check
  check (channel in ('ghl_webhook','ghl_tag','ghl_sms','email'));
