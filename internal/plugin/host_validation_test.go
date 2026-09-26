package plugin

import (
	"encoding/json"
	"strings"
	"testing"
)

type hostSimulatedMetadata struct {
	Name             string
	Version          string
	Author           string
	GitHubRepository string
	Logo             string
}

type hostSimulatedCapabilities struct {
	UsagePlugin   bool `json:"usage_plugin"`
	ManagementAPI bool `json:"management_api"`
}

type hostSimulatedRegistration struct {
	SchemaVersion uint32                    `json:"schema_version"`
	Metadata      hostSimulatedMetadata     `json:"metadata"`
	Capabilities  hostSimulatedCapabilities `json:"capabilities"`
}

func TestHostValidationAgainstRegister(t *testing.T) {
	instance := GetInstance()

	regReq, _ := json.Marshal(map[string]interface{}{
		"schema_version": 1,
		"config_yaml":    []byte(""),
	})

	rawResp, err := instance.HandleCall("plugin.register", regReq)
	if err != nil {
		t.Fatalf("HandleCall error: %v", err)
	}

	var env struct {
		OK     bool            `json:"ok"`
		Result json.RawMessage `json:"result"`
		Error  *struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}

	if err := json.Unmarshal(rawResp, &env); err != nil {
		t.Fatalf("unmarshal envelope: %v", err)
	}

	if !env.OK {
		t.Fatalf("envelope error: %+v", env.Error)
	}

	var hostReg hostSimulatedRegistration
	if err := json.Unmarshal(env.Result, &hostReg); err != nil {
		t.Fatalf("host unmarshal error: %v", err)
	}

	t.Logf("Decoded: SchemaVersion=%d, Name=%q, Version=%q, Author=%q, Repo=%q, UsagePlugin=%v, ManagementAPI=%v",
		hostReg.SchemaVersion, hostReg.Metadata.Name, hostReg.Metadata.Version, hostReg.Metadata.Author, hostReg.Metadata.GitHubRepository,
		hostReg.Capabilities.UsagePlugin, hostReg.Capabilities.ManagementAPI)

	if strings.TrimSpace(hostReg.Metadata.Name) == "" {
		t.Errorf("Metadata.Name is empty")
	}
	if strings.TrimSpace(hostReg.Metadata.Version) == "" {
		t.Errorf("Metadata.Version is empty")
	}
	if strings.TrimSpace(hostReg.Metadata.Author) == "" {
		t.Errorf("Metadata.Author is empty")
	}
	if strings.TrimSpace(hostReg.Metadata.GitHubRepository) == "" {
		t.Errorf("Metadata.GitHubRepository is empty")
	}
	if !hostReg.Capabilities.UsagePlugin && !hostReg.Capabilities.ManagementAPI {
		t.Errorf("No capabilities enabled!")
	}
}
