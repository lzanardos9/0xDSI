use crate::define_connector;

// AWS CloudTrail - S3 / SNS / EventBridge
define_connector!(AwsCloudTrail, "AWS CloudTrail", "aws_cloudtrail", "cloud_aws", "S3 / SNS / EventBridge");

// Amazon GuardDuty
define_connector!(AwsGuardDuty, "Amazon GuardDuty", "aws_guardduty", "cloud_aws", "EventBridge / S3 Export");

// AWS Security Hub - ASFF format
define_connector!(AwsSecurityHub, "AWS Security Hub", "aws_security_hub", "cloud_aws", "ASFF / EventBridge");

// AWS VPC Flow Logs
define_connector!(AwsVpcFlow, "AWS VPC Flow Logs", "aws_vpc_flow", "cloud_aws", "CloudWatch Logs / S3 / Kinesis");

// AWS WAF Logs
define_connector!(AwsWaf, "AWS WAF Logs", "aws_waf", "cloud_aws", "S3 / Kinesis Firehose");

// S3 Poller (generic)
define_connector!(S3Poller, "S3/Blob Storage Poller", "s3_poller", "cloud_aws", "S3 ListObjects / GetObject polling");
