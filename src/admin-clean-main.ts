const root = document.querySelector<HTMLDivElement>('#app')
if (!root) throw new Error('Missing #app root')

root.innerHTML = '<main class="clean-app" data-clean-app="admin" aria-busy="true"></main>'
