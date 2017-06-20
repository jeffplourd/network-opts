
let _ = require('lodash');
let { exec } = require('child_process');

function $exec(cmd, options = {}) {
  options['env'] = _.assign({}, process.env, options.env || {});

  return new Promise((resolve, reject) => {
    let child = exec(cmd, options, (err, stdout, stderr) => {
      if (err) {
        reject(stderr);
      }
      resolve(stdout);
    });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
  });
}

function gcloudCMD() {
  if (process.env.CIRCLECI) {
    return 'sudo /opt/google-cloud-sdk/bin/gcloud';
  }
  return 'gcloud';
}

function gcloud(args) {
  return `${gcloudCMD()} ${args}`;
}

function createPattern(obj) {
  const result = [];
  _.forEach(obj, (value, key) => {
    result.push({
      match: key,
      replacement: value
    });
  });
  return result;
}

function kubeService(imageName) {
  return $exec(`kubectl get services -o json -l app=${imageName}`)
    .then((stdout) => {
      let output = JSON.parse(stdout);
      if (output.items.length === 0) {
        return null;
      }
      return output.items[0];
    })
}

function kubeServiceName(imageName) {
  return kubeService(imageName).then((service) => {
    return service === null ? null : service.metadata.name;
  });
}

module.exports = {
  $exec,
  gcloud,
  createPattern,
  kubeService,
  kubeServiceName
};