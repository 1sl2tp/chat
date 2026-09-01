package xyz.taphoa.chat;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

@CapacitorPlugin(name = "AudioRoute")
public class AudioRoutePlugin extends Plugin {
    private AudioManager audioManager() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod
    public void setRoute(PluginCall call) {
        String requested = call.getString("route");
        if (!"receiver".equals(requested) && !"speaker".equals(requested)) {
            call.reject("route must be receiver or speaker");
            return;
        }

        AudioManager manager = audioManager();
        manager.setMode(AudioManager.MODE_IN_COMMUNICATION);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            int requestedType = "speaker".equals(requested)
                ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
            AudioDeviceInfo target = findCommunicationDevice(manager, requestedType);
            if (target == null) {
                JSObject result = snapshot(manager);
                result.put("ok", false);
                result.put("reason", "requested_device_unavailable");
                call.resolve(result);
                return;
            }

            boolean accepted = manager.setCommunicationDevice(target);
            JSObject result = snapshot(manager);
            result.put("ok", accepted && requested.equals(result.getString("route")));
            result.put("requested", requested);
            call.resolve(result);
            return;
        }

        setLegacySpeakerphone(manager, "speaker".equals(requested));
        boolean speaker = isLegacySpeakerphoneOn(manager);
        String actual = speaker ? "speaker" : "receiver";
        JSObject result = new JSObject();
        result.put("ok", requested.equals(actual));
        result.put("requested", requested);
        result.put("route", actual);
        result.put("legacy", true);
        call.resolve(result);
    }

    @PluginMethod
    public void getRoute(PluginCall call) {
        AudioManager manager = audioManager();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            call.resolve(snapshot(manager));
            return;
        }

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("route", isLegacySpeakerphoneOn(manager) ? "speaker" : "receiver");
        result.put("legacy", true);
        call.resolve(result);
    }

    @PluginMethod
    public void clearRoute(PluginCall call) {
        AudioManager manager = audioManager();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            manager.clearCommunicationDevice();
        } else {
            setLegacySpeakerphone(manager, false);
        }
        manager.setMode(AudioManager.MODE_NORMAL);

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("route", "system");
        call.resolve(result);
    }

    private AudioDeviceInfo findCommunicationDevice(AudioManager manager, int type) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null;
        List<AudioDeviceInfo> devices = manager.getAvailableCommunicationDevices();
        for (AudioDeviceInfo device : devices) {
            if (device.getType() == type) return device;
        }
        return null;
    }

    private JSObject snapshot(AudioManager manager) {
        JSObject result = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            result.put("ok", false);
            result.put("route", "unknown");
            return result;
        }

        AudioDeviceInfo current = manager.getCommunicationDevice();
        String route = routeForDevice(current);
        result.put("ok", current != null);
        result.put("route", route);
        if (current != null) {
            result.put("deviceType", current.getType());
            result.put("deviceId", current.getId());
            CharSequence name = current.getProductName();
            result.put("deviceName", name == null ? "" : name.toString());
        }
        return result;
    }

    private String routeForDevice(AudioDeviceInfo device) {
        if (device == null) return "unknown";
        if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) return "receiver";
        if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) return "speaker";
        return "other";
    }

    @SuppressWarnings("deprecation")
    private void setLegacySpeakerphone(AudioManager manager, boolean enabled) {
        manager.setSpeakerphoneOn(enabled);
    }

    @SuppressWarnings("deprecation")
    private boolean isLegacySpeakerphoneOn(AudioManager manager) {
        return manager.isSpeakerphoneOn();
    }
}
