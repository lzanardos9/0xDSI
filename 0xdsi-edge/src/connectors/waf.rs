use crate::define_connector;

define_connector!(CloudflareWaf, "Cloudflare WAF", "cloudflare_waf", "waf", "Logpush (S3/R2) / GraphQL API");
define_connector!(AwsWafLogs, "AWS WAF", "aws_waf_logs", "waf", "Kinesis Firehose / S3 / CloudWatch");
define_connector!(AkamaiWaf, "Akamai App & API Protector", "akamai_waf", "waf", "SIEM Integration / Datastream");
define_connector!(ImpervaWaf, "Imperva WAF", "imperva_waf", "waf", "Syslog CEF / REST API / S3");
