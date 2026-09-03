<template>
  <aside class="sidebar animated shrink columns">
    <div class="logo">
      <router-link :to="dashboardPath" replace>
        <img :src="globalConfig.logo" :alt="globalConfig.installationName" />
      </router-link>
    </div>

    <div class="main-nav">
      <transition-group name="menu-list" tag="ul" class="menu vertical">
        <sidebar-item
          v-for="item in accessibleMenuItems"
          :key="item.toState"
          :menu-item="item"
        />
      </transition-group>
    </div>

    <div class="bottom-nav">
      <availability-status />
    </div>

    <div class="bottom-nav app-context-menu" @click="toggleOptions">
      <agent-details />
      <notification-bell />
      <span class="current-user--options icon ion-android-more-vertical" />
      <options-menu
        :show="showOptionsMenu"
        @close="toggleOptions"
      />
    </div>
  </aside>
</template>

<script>
import { mapGetters } from 'vuex';

import SidebarItem from './SidebarItem';
import AvailabilityStatus from './AvailabilityStatus';
import { frontendURL } from '../../helper/URLHelper';
import { getSidebarItems } from '../../i18n/default-sidebar';
import NotificationBell from './sidebarComponents/NotificationBell';
import AgentDetails from './sidebarComponents/AgentDetails.vue';
import OptionsMenu from './sidebarComponents/OptionsMenu.vue';

export default {
  components: {
    AgentDetails,
    SidebarItem,
    AvailabilityStatus,
    NotificationBell,
    OptionsMenu,
  },
  data() {
    return {
      showOptionsMenu: false,
    };
  },
  computed: {
    ...mapGetters({
      globalConfig: 'globalConfig/get',
      accountId: 'getCurrentAccountId',
      currentRole: 'getCurrentRole',
    }),
    sidemenuItems() {
      return getSidebarItems(this.accountId);
    },
    accessibleMenuItems() {
      const groupKey = Object.keys(this.sidemenuItems);
      let menuItems = [];
      for (let i = 0; i < groupKey.length; i += 1) {
        const groupItem = this.sidemenuItems[groupKey[i]];
        if (groupItem.routes.includes(this.currentRoute)) {
          menuItems = Object.values(groupItem.menuItems);
        }
      }
      return this.filterMenuItemsByRole(menuItems);
    },
    currentRoute() {
      return this.$store.state.route.name;
    },
    dashboardPath() {
      return frontendURL(`accounts/${this.accountId}/dashboard`);
    },
  },
  mounted() {
    this.$store.dispatch('notifications/unReadCount');
  },
  methods: {
    filterMenuItemsByRole(menuItems) {
      if (!this.currentRole) {
        return [];
      }
      return menuItems.filter(
        menuItem =>
          window.roleWiseRoutes[this.currentRole].indexOf(
            menuItem.toStateName
          ) > -1
      );
    },
    toggleOptions() {
      this.showOptionsMenu = !this.showOptionsMenu;
    },
  },
};
</script>

<style lang="scss">
@import '~dashboard/assets/scss/variables';

.app-context-menu {
  align-items: center;
  cursor: pointer;
  display: flex;
  flex-direction: row;
  height: 6rem;
}

.current-user--options {
  font-size: $font-size-big;
  margin-bottom: auto;
  margin-left: auto;
  margin-top: auto;
}
</style>
