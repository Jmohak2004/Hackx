// Test-only EIP-1193 provider. It never holds a private key and forwards only to
// an isolated, unlocked Hardhat node on loopback with chain ID 31337.
(() => {
  if (!["127.0.0.1", "localhost"].includes(location.hostname)) return;
  const config = window.__HACKX_LOCAL_TEST__;
  if (!config || !/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(config.rpcUrl)) return;
  const listeners = new Map();
  let connected = sessionStorage.getItem("hackx-test-wallet-connected") === "true";
  let account;
  async function rpc(method, params = []) {
    const response = await fetch(config.rpcUrl, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    });
    const payload = await response.json();
    if (payload.error) throw Object.assign(new Error(payload.error.message), { code: payload.error.code });
    return payload.result;
  }
  async function currentAccount() {
    account ||= (await rpc("eth_accounts"))[config.accountIndex || 0];
    return account;
  }
  function emit(name, value) {
    for (const listener of listeners.get(name) || []) listener(value);
  }
  const provider = {
    isMetaMask: false,
    chainId: "0x7a69",
    networkVersion: "31337",
    selectedAddress: null,
    isConnected: () => connected,
    on(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
      return provider;
    },
    removeListener(name, callback) { listeners.get(name)?.delete(callback); return provider; },
    async request({ method, params = [] }) {
      if (method === "eth_requestAccounts" || method === "wallet_requestPermissions") {
        connected = true;
        sessionStorage.setItem("hackx-test-wallet-connected", "true");
        provider.selectedAddress = await currentAccount();
        emit("accountsChanged", [account]);
        if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
        return [account];
      }
      if (method === "eth_accounts") return connected ? [await currentAccount()] : [];
      if (method === "wallet_getPermissions") return connected ? [{ parentCapability: "eth_accounts" }] : [];
      if (method === "wallet_revokePermissions") {
        connected = false; sessionStorage.removeItem("hackx-test-wallet-connected");
        emit("accountsChanged", []); return null;
      }
      if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") {
        if (Number(BigInt(params[0].chainId)) !== 31337) throw Object.assign(new Error("Only the local test chain is available"), { code: 4902 });
        return null;
      }
      if (method === "wallet_getCapabilities") return {};
      if (method.startsWith("wallet_")) throw Object.assign(new Error("Unsupported test-wallet method"), { code: 4200 });
      if (method === "eth_sendTransaction") {
        if (!connected || Number(BigInt(await rpc("eth_chainId"))) !== 31337) throw new Error("Local wallet is not connected");
        const transaction = { ...params[0] };
        if (transaction.from.toLowerCase() !== (await currentAccount()).toLowerCase()) throw new Error("Wrong test wallet account");
        if (!transaction.gas) {
          const estimated = BigInt(await rpc("eth_estimateGas", [transaction]));
          transaction.gas = "0x" + (estimated + estimated / 5n).toString(16);
        }
        return rpc(method, [transaction]);
      }
      return rpc(method, params);
    },
  };
  Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
    detail: {
      info: {
        uuid: "12c7d064-5902-40a6-bec2-13ed2a9e4001",
        name: "HackX Local Test Wallet", rdns: "test.hackx.local",
        icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
      },
      provider,
    },
  }));
  window.addEventListener("eip6963:requestProvider", announce);
  window.dispatchEvent(new Event("ethereum#initialized"));
  announce();
})();
