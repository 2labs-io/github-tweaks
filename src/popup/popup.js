const list = document.getElementById("tweaks");
const template = document.getElementById("tweak-row");

document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;

function setToggle(button, on) {
  button.setAttribute("aria-checked", String(on));
  button.querySelector(".toggle-status").textContent = on ? "On" : "Off";
}

chrome.storage.sync.get(globalThis.GITHUB_TWEAKS_DEFAULTS).then((settings) => {
  for (const tweak of globalThis.GITHUB_TWEAKS) {
    const row = template.content.firstElementChild.cloneNode(true);
    const id = `tweak-${tweak.id}`;
    const name = row.querySelector(".tweak-name");
    const description = row.querySelector(".tweak-description");
    const toggle = row.querySelector(".toggle");

    name.textContent = tweak.name;
    name.htmlFor = id;
    description.textContent = tweak.description;
    description.id = `${id}-description`;
    toggle.id = id;
    toggle.setAttribute("aria-describedby", description.id);
    setToggle(toggle, settings[tweak.id] !== false);

    toggle.addEventListener("click", () => {
      const on = toggle.getAttribute("aria-checked") !== "true";
      setToggle(toggle, on);
      chrome.storage.sync.set({ [tweak.id]: on });
    });

    list.append(row);
  }
});
