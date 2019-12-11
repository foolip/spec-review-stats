'use strict';

const graphql = require('@octokit/graphql').graphql.defaults({
  headers: {
    authorization: `token ${process.env.GITHUB_TOKEN}`,
  },
});


async function checkPRs(owner, repo) {
  // Note that there is a bug with `participants`:
  // https://gist.github.com/foolip/78d0522f31eed76095ff85976ac0660f
  // https://gist.github.com/foolip/f132b07860761d7d159e3a8dabc6075d
  //
  // participants(first: 100) {
  //   nodes {
  //     login
  //   }
  //   totalCount
  // }

  const since = Date.parse('2019-01-01T00:00Z');
  let mergedCount = 0;
  let approvedCount = 0;
  for (let cursor; ;) {
    const response = await graphql(`
      query($owner: String!, $repo: String!, $cursor: String) {
        repository(owner: $owner, name: $repo) {
          pullRequests(after: $cursor, first: 100, orderBy: { field: CREATED_AT, direction: DESC}, states: [MERGED]) {
            nodes {
              createdAt
              permalink
              reviews(first: 1, states: [APPROVED]) {
                totalCount
              }
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
      }
    `, {
      owner,
      repo,
      cursor,
    });
    const pulls = response.repository.pullRequests.nodes;
    let stop = false;
    for (const pull of pulls) {
      if (Date.parse(pull.createdAt) < since) {
        stop = true;
        break;
      }
      const approved = pull.reviews.totalCount > 0;
      mergedCount++;
      if (approved) {
        approvedCount++;
      }
      console.log(pull.permalink, approved ? 'approved' : 'not approved');
    }
    if (stop) {
      break;
    }
    if (response.repository.pullRequests.pageInfo.hasNextPage) {
      cursor = response.repository.pullRequests.pageInfo.endCursor;
    } else {
      break;
    }
  }
  console.log(`\n${approvedCount}/${mergedCount} approved (${Math.round(100*approvedCount/mergedCount)}%)`);
}

async function main() {
  const [owner, repo] = process.argv[2].split('/');
  await checkPRs(owner, repo);
}

main().catch((reason) => {
  console.error(reason);
  process.exit(1);
});
