const { ACMPCAClient } = require("@aws-sdk/client-acm-pca");

const region = process.env.AWS_REGION;

if (!region) {
  throw new Error("AWS_REGION is missing in environment variables");
}

const acmPcaClient = new ACMPCAClient({
  region,
});

const certificateAuthorityArn = process.env.AWS_PRIVATE_CA_ARN;

if (!certificateAuthorityArn) {
  throw new Error("AWS_PRIVATE_CA_ARN is missing");
}

module.exports = {
  acmPcaClient,
  certificateAuthorityArn,
};
