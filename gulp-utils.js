
let _ = require('lodash');
let { exec } = require('child_process');

/**
 * @param cmd {string}
 * @param options {object}
 * @return {Promise.<any>}
 */
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

/**
 * @param clusterId {string}
 * @param zoneId {string}
 * @param projectId {string}
 * @return {Promise.<string>}
 */
function gcluster(clusterId, zoneId, projectId) {
  return new Promise((resolve) => {
    $exec(gcloud(`container clusters describe ${clusterId} --zone ${zoneId} --project ${projectId} --format json`))
      .then((result) => {
        resolve(result);
      })
      .catch(() => {
        resolve(null);
      })
  });

}

/**
 * @param clusterId {string}
 * @param zoneId {string}
 * @param projectId {string}
 * @return {Promise.<boolean>}
 */
function gclusterExists(clusterId, zoneId, projectId) {
  return gcluster(clusterId, zoneId, projectId).then((cluster) => cluster !== null);
}

function extractMapping(rawPortMapping) {
  if (!rawPortMapping) {
    return [[80, 80]];
  }

  return JSON.parse(rawPortMapping);
}

module.exports = {
  $exec,
  gcloud,
  createPattern,
  kubeService,
  kubeServiceName,
  gcluster,
  gclusterExists,
  extractMapping
};