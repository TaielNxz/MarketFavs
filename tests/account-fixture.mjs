export function mockAccount(window, username = "test-user") {
  const account = { username, namespace: username };
  window.Spicetify = {
    Platform: {
      UserAPI: {
        getUser: async () =>
          account.username ? { username: account.username } : null,
      },
      LocalStorageAPI: {
        get namespace() {
          return account.namespace;
        },
      },
    },
  };
  return account;
}

export const settle = (window) =>
  new Promise((resolve) => window.setTimeout(resolve, 0));

export async function boot(window, bundle) {
  if (!window.Spicetify) mockAccount(window);
  window.eval(bundle);
  await settle(window);
}
