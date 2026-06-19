use crate::define_connector;

define_connector!(GithubSecurity, "GitHub Advanced Security", "github_security", "devsecops", "Webhook / REST API / SARIF");
define_connector!(GitlabSecurity, "GitLab Ultimate Security", "gitlab_security", "devsecops", "REST API / Webhook");
define_connector!(SonarQube, "SonarQube", "sonarqube", "devsecops", "REST API / Webhook");
define_connector!(Checkmarx, "Checkmarx One", "checkmarx", "devsecops", "REST API / Webhook / SARIF");
